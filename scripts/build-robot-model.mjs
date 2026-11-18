/**
 * Builds `public/models/worker-robot.glb` from the same part spec the on-screen
 * robot renders: `src/lib/robotModel.ts`.
 *
 * Why this exists: the human partner wants to request shape tweaks over time.
 * With the robot's shape in one data module, a tweak is a one-number edit that
 * changes the screen and the model file together — they can never drift apart.
 *
 * Run: npm run build:model
 *
 * Notes:
 *  - Node 24 strips TypeScript types natively, so the `.ts` spec imports
 *    directly. `WorkDesk.tsx` is deliberately NOT imported (it is `.tsx` and
 *    pulls in React/three); the spec is root-local, i.e. the robot's origin sits
 *    on the chair seat, which is all this file needs to know.
 *  - `GLTFExporter` expects browser globals (`FileReader`, `Blob`). Node has
 *    `Blob` but no `FileReader`, so a tiny polyfill is installed first.
 *  - The script round-trips its own output through `GLTFLoader` and fails the
 *    build if the file it wrote is not loadable, misnamed, or the wrong size.
 */
import { Blob as NodeBlob } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const SPEC_PATH = resolve(REPO, 'src/lib/robotModel.ts');
const OUT_DIR = resolve(REPO, 'public/models');
const GLB_PATH = resolve(OUT_DIR, 'worker-robot.glb');
const META_PATH = resolve(OUT_DIR, 'worker-robot.meta.json');

const ROOT_NAME = 'WorkerRobot';

/* -------------------------------------------------------------------------- */
/*  Browser shims the exporter needs                                          */
/* -------------------------------------------------------------------------- */

class FileReaderPolyfill {
  result = null;
  onloadend = null;

  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.onloadend?.();
    });
  }

  readAsDataURL(blob) {
    blob.arrayBuffer().then((buffer) => {
      const base64 = Buffer.from(buffer).toString('base64');
      this.result = `data:${blob.type || 'application/octet-stream'};base64,${base64}`;
      this.onloadend?.();
    });
  }
}

globalThis.FileReader = FileReaderPolyfill;
globalThis.Blob = NodeBlob;

const THREE = await import('three');
const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');

const spec = await import(pathToFileURL(SPEC_PATH).href);
const {
  ROBOT_NODES,
  ROBOT_PARTS,
  FACE,
  HANDS,
  ANTENNA_BALL,
  ROBOT_BODY_DEFAULT,
  ROBOT_HEIGHT,
  resolveRobotColor,
} = spec;

/* -------------------------------------------------------------------------- */
/*  Geometry helpers                                                          */
/* -------------------------------------------------------------------------- */

/**
 * glTF has no `MeshLambertMaterial`; the exporter would silently upgrade it to
 * `MeshStandardMaterial` anyway. Building Standard directly keeps the console
 * quiet and gives Blender/glTF viewers correct PBR values (fully rough, no metal).
 */
function materialFor(part, color) {
  if (part.unlit) {
    return new THREE.MeshBasicMaterial({ color });
  }
  return new THREE.MeshStandardMaterial({ color, metalness: 0, roughness: 1 });
}

function geometryFor(part) {
  if (part.shape === 'cylinder') {
    return new THREE.CylinderGeometry(
      part.radiusTop ?? part.size[0] / 2,
      part.radiusBottom ?? part.size[0] / 2,
      part.size[1],
      part.segments ?? 10,
    );
  }
  if (part.shape === 'sphere') {
    const radius = part.size[0] / 2;
    return new THREE.SphereGeometry(radius, part.segments ?? 14, part.segments ?? 14);
  }
  return new THREE.BoxGeometry(part.size[0], part.size[1], part.size[2]);
}

/**
 * `userData.recolor` tells `ModelRobot.tsx` which palette role a mesh plays, so
 * a loaded model can be tinted per agent (`body` = accent, `limb` = darker
 * shade). glTF stores it in `extras`, which the loader restores.
 */
function makeMesh({ name, part, color, recolor, position, rotation }) {
  const mesh = new THREE.Mesh(geometryFor(part), materialFor(part, color));
  mesh.name = name;
  if (position) mesh.position.set(position[0], position[1], position[2]);
  if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  if (recolor) mesh.userData.recolor = recolor;
  return mesh;
}

/* -------------------------------------------------------------------------- */
/*  Build the hierarchy                                                       */
/* -------------------------------------------------------------------------- */

const root = new THREE.Group();
root.name = ROOT_NAME;

/** One group per spec node, parent-first so parents always exist. */
const nodeGroups = new Map();
for (const node of ROBOT_NODES) {
  const group = new THREE.Group();
  group.name = node.id;
  group.position.set(node.position[0], node.position[1], node.position[2]);
  nodeGroups.set(node.id, group);
  if (node.parent) {
    const parent = nodeGroups.get(node.parent);
    if (!parent) throw new Error(`robot spec: node "${node.id}" precedes its parent`);
    parent.add(group);
  } else {
    root.add(group);
  }
}

/** Rigid blocks. */
let partCount = 0;
for (const part of ROBOT_PARTS) {
  const group = nodeGroups.get(part.node);
  if (!group) throw new Error(`robot spec: part "${part.id}" targets unknown node "${part.node}"`);
  const recolor =
    part.color === 'body' || part.color === 'limb' || part.color === 'accent'
      ? part.color === 'accent'
        ? 'body'
        : part.color
      : undefined;
  group.add(
    makeMesh({
      name: part.id,
      part,
      color: resolveRobotColor(part.color, ROBOT_BODY_DEFAULT),
      recolor,
      position: part.position,
      rotation: part.rotation,
    }),
  );
  partCount += 1;
}

/* -------------------------------------------------------------------------- */
/*  Runtime-driven geometry, baked in its rest pose                           */
/* -------------------------------------------------------------------------- */

const headGroup = nodeGroups.get('head');
const antennaGroup = nodeGroups.get('antenna');

const eyeGroup = new THREE.Group();
eyeGroup.name = 'eyes';
eyeGroup.position.set(...FACE.eyeGroup.position);
headGroup.add(eyeGroup);

for (const [side, x] of [
  ['L', -FACE.eyeOffsetX],
  ['R', FACE.eyeOffsetX],
]) {
  const eye = new THREE.Group();
  eye.name = `eye${side}`;
  eye.position.set(x, 0, 0);
  eyeGroup.add(eye);

  eye.add(
    makeMesh({
      name: `pupil${side}`,
      part: { shape: 'box', size: FACE.pupil.size },
      color: resolveRobotColor(FACE.pupil.color, ROBOT_BODY_DEFAULT),
    }),
  );
  eye.add(
    makeMesh({
      name: `glint${side}`,
      part: { shape: 'box', size: FACE.glint.size, unlit: true },
      color: resolveRobotColor(FACE.glint.color, ROBOT_BODY_DEFAULT),
      position: FACE.glint.position,
    }),
  );
  partCount += 2;
}

headGroup.add(
  makeMesh({
    name: 'mouth',
    part: { shape: 'box', size: FACE.mouth.size, unlit: true },
    color: resolveRobotColor(FACE.mouth.color, ROBOT_BODY_DEFAULT),
    position: FACE.mouth.position,
  }),
);
partCount += 1;

for (const [side, sign] of [
  ['L', -1],
  ['R', 1],
]) {
  headGroup.add(
    makeMesh({
      name: `blush${side}`,
      part: { shape: 'box', size: FACE.blush.size, unlit: true },
      color: resolveRobotColor(FACE.blush.color, ROBOT_BODY_DEFAULT),
      position: [sign * FACE.blush.position[0], FACE.blush.position[1], FACE.blush.position[2]],
    }),
  );
  partCount += 1;
}

for (const arm of ['armL', 'armR']) {
  nodeGroups.get(arm).add(
    makeMesh({
      name: `hand${arm.endsWith('L') ? 'L' : 'R'}`,
      part: { shape: 'box', size: HANDS.size },
      color: resolveRobotColor(HANDS.color, ROBOT_BODY_DEFAULT),
      position: HANDS.position,
    }),
  );
  partCount += 1;
}

antennaGroup.add(
  makeMesh({
    name: 'antennaBall',
    part: { shape: 'sphere', size: [ANTENNA_BALL.radius * 2, 0, 0], segments: ANTENNA_BALL.segments },
    color: resolveRobotColor(ANTENNA_BALL.color, ROBOT_BODY_DEFAULT),
    position: ANTENNA_BALL.position,
  }),
);
partCount += 1;

/* -------------------------------------------------------------------------- */
/*  Sanity check before writing                                               */
/* -------------------------------------------------------------------------- */

root.updateMatrixWorld(true);
const box = new THREE.Box3().setFromObject(root);
const size = new THREE.Vector3();
box.getSize(size);

const problems = [];
if (Math.abs(size.y - ROBOT_HEIGHT) > 0.001) {
  problems.push(
    `bounding height ${size.y.toFixed(4)} m disagrees with spec ROBOT_HEIGHT ${ROBOT_HEIGHT.toFixed(4)} m`,
  );
}
if (problems.length) {
  console.error('✗ model build failed:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

/* -------------------------------------------------------------------------- */
/*  Export                                                                    */
/* -------------------------------------------------------------------------- */

const glb = await new GLTFExporter().parseAsync(root, { binary: true });
const glbBuffer = Buffer.from(glb);
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(GLB_PATH, glbBuffer);

const meta = {
  version: 1,
  generatedAt: new Date().toISOString(),
  rootOrigin: 'seat',
  rootName: ROOT_NAME,
  nodeNames: ROBOT_NODES.map((node) => node.id),
  partCount,
  heightMetres: Number(size.y.toFixed(4)),
};
writeFileSync(META_PATH, `${JSON.stringify(meta, null, 2)}\n`);

/* -------------------------------------------------------------------------- */
/*  Round-trip: prove the file we just wrote is loadable and correct          */
/* -------------------------------------------------------------------------- */

const arrayBuffer = glbBuffer.buffer.slice(
  glbBuffer.byteOffset,
  glbBuffer.byteOffset + glbBuffer.byteLength,
);
const loaded = await new GLTFLoader().parseAsync(arrayBuffer, '');

const loadedRoot = loaded.scene.getObjectByName(ROOT_NAME);
const failures = [];
if (!loadedRoot) {
  failures.push(`root node "${ROOT_NAME}" missing after reload`);
}
for (const node of ROBOT_NODES) {
  if (!loaded.scene.getObjectByName(node.id)) {
    failures.push(`node "${node.id}" missing after reload`);
  }
}

const loadedBox = new THREE.Box3().setFromObject(loaded.scene);
const loadedSize = new THREE.Vector3();
loadedBox.getSize(loadedSize);
if (Math.abs(loadedSize.y - ROBOT_HEIGHT) > 0.001) {
  failures.push(
    `reloaded height ${loadedSize.y.toFixed(4)} m disagrees with spec ${ROBOT_HEIGHT.toFixed(4)} m`,
  );
}

// Per-agent tinting depends on `extras` surviving the round trip.
const tintable = [];
loaded.scene.traverse((object) => {
  const role = object.userData?.recolor;
  if (role === 'body' || role === 'limb') tintable.push(object);
});
if (tintable.length === 0) {
  failures.push('no meshes carry userData.recolor after reload — per-agent tinting would break');
}

if (failures.length) {
  console.error('✗ model round-trip failed:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log('✓ worker-robot.glb');
console.log(`  parts        ${partCount}`);
console.log(`  height       ${size.y.toFixed(3)} m (floor to antenna ball)`);
console.log(`  tintable     ${tintable.length} meshes`);
console.log(`  size         ${(glbBuffer.byteLength / 1024).toFixed(1)} KiB`);
console.log(`  written      ${GLB_PATH}`);
console.log(`  metadata     ${META_PATH}`);
