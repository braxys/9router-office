/**
 * Truth table for the provider identity rules.
 *
 * Imports the shipping modules directly (Node 24 strips types), so this
 * exercises the real tables rather than a re-implementation.
 *
 * `robotModel.ts` is imported first and on purpose: it must stay free of
 * runtime imports so Node can load it, and this script fails loudly if that
 * ever stops being true.
 *
 *   npm run identity:test
 */
import {
  ANTENNA_BALL,
  EMBLEM_ENVELOPE,
  EMBLEMS,
  FACE,
  ROBOT_COLORS,
  ROBOT_ENVELOPE_HEIGHT,
  ROBOT_ENVELOPE_TOP,
  ROBOT_HEIGHT,
  ROBOT_PARTS,
  SHELLS,
  SHELL_ENVELOPE,
  TOPPERS,
  TOPPER_ENVELOPE,
  identityBounds,
  identityPartsFor,
  resolveRobotColor,
  robotBounds,
  robotNodePosition,
} from '../src/lib/robotModel.ts';
import { IDENTITIES, resolveIdentity } from '../src/lib/providerIdentity.ts';
import { readFileSync } from 'node:fs';

let failures = 0;
let total = 0;

function check(label, actual, expected) {
  total += 1;
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) failures += 1;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`);
  if (!pass) {
    console.log(`      expected: ${JSON.stringify(expected)}`);
    console.log(`      actual  : ${JSON.stringify(actual)}`);
  }
}

/* -------------------------------------------------------------------------- */
/*  Geometry helpers                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Half-extents of a part's box after its Euler rotation — the same maths
 * `robotModel.ts` uses for `robotBounds`, written out here so the test does not
 * trust the module it is testing.
 */
function rotatedHalfExtents(part) {
  const hx = part.size[0] / 2;
  const hy = part.size[1] / 2;
  const hz = part.size[2] / 2;
  const [rx, ry, rz] = part.rotation ?? [0, 0, 0];
  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const cz = Math.cos(rz);
  const sz = Math.sin(rz);

  const m00 = cy * cz;
  const m01 = -cy * sz;
  const m02 = sy;
  const m10 = sx * sy * cz + cx * sz;
  const m11 = -sx * sy * sz + cx * cz;
  const m12 = -sx * cy;
  const m20 = -cx * sy * cz + sx * sz;
  const m21 = cx * sy * sz + sx * cz;
  const m22 = cx * cy;

  return [
    Math.abs(m00) * hx + Math.abs(m01) * hy + Math.abs(m02) * hz,
    Math.abs(m10) * hx + Math.abs(m11) * hy + Math.abs(m12) * hz,
    Math.abs(m20) * hx + Math.abs(m21) * hy + Math.abs(m22) * hz,
  ];
}

/** Axis-aligned box of one part, in its node's space. */
function aabb(part) {
  const [hx, hy, hz] = rotatedHalfExtents(part);
  const [x, y, z] = part.position;
  return { min: [x - hx, y - hy, z - hz], max: [x + hx, y + hy, z + hz] };
}

/** True when two boxes share volume. Touching faces do not count. */
function overlaps(a, b) {
  for (let axis = 0; axis < 3; axis += 1) {
    if (a.min[axis] >= b.max[axis] || b.min[axis] >= a.max[axis]) return false;
  }
  return true;
}

function contains(outer, inner) {
  for (let axis = 0; axis < 3; axis += 1) {
    if (inner.min[axis] < outer.min[axis] - 1e-9) return false;
    if (inner.max[axis] > outer.max[axis] + 1e-9) return false;
  }
  return true;
}

function union(boxes) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const box of boxes) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], box.min[axis]);
      max[axis] = Math.max(max[axis], box.max[axis]);
    }
  }
  return { min, max };
}

/**
 * The locked face: every eye, the mouth and both blush patches, grown by 5 mm.
 * Nothing an identity adds to the head may enter this box — that is the
 * promise that all four status animations keep working untouched.
 */
const FACE_BOX = (() => {
  const boxes = [];
  for (const side of [-1, 1]) {
    boxes.push(
      aabb({
        size: FACE.pupil.size,
        position: [
          FACE.eyeGroup.position[0] + side * FACE.eyeOffsetX,
          FACE.eyeGroup.position[1],
          FACE.eyeGroup.position[2],
        ],
      }),
    );
  }
  boxes.push(aabb({ size: FACE.mouth.size, position: FACE.mouth.position }));
  for (const side of [-1, 1]) {
    boxes.push(
      aabb({
        size: FACE.blush.size,
        position: [
          side * FACE.blush.position[0],
          FACE.blush.position[1],
          FACE.blush.position[2],
        ],
      }),
    );
  }
  const grown = union(boxes);
  return {
    min: grown.min.map((value) => value - 0.005),
    max: grown.max.map((value) => value + 0.005),
  };
})();

/**
 * The envelopes come from the module under test, on purpose: the shipped numbers
 * are what the rig and the pill anchor actually rely on, and a copy here could
 * drift from them silently. They are asserted separately below so a widening of
 * an envelope is a visible change, not a quiet one.
 */
const SHELL_BOX = SHELL_ENVELOPE;
const TOPPER_BOX = TOPPER_ENVELOPE;
const EMBLEM_BOX = EMBLEM_ENVELOPE;

const ANTENNA_TOP = robotNodePosition('antenna')[1];

/* -------------------------------------------------------------------------- */
console.log('\n--- assertion 1: every identity id has an entry ---\n');

check(
  'every IdentityId has an entry',
  Object.keys(IDENTITIES).sort(),
  [
    'anthropic',
    'antigravity',
    'codebuddy',
    'codex',
    'default',
    'gemini',
    'kilocode',
    'nous',
    'nvidia',
    'ollama',
    'openai',
    'opencode',
    'openrouter',
  ],
);
check('unknown key falls back to default', resolveIdentity('apa-saja').id, 'default');
check('empty key falls back to default', resolveIdentity('').id, 'default');

/* -------------------------------------------------------------------------- */
console.log('\n--- assertion 2: live 9Router provider ids ---\n');

for (const [key, id] of [
  ['codebuddy-intl', 'codebuddy'],
  ['antigravity', 'antigravity'],
  ['codex', 'codex'],
  ['gemini', 'gemini'],
  ['kilocode', 'kilocode'],
  ['nvidia', 'nvidia'],
  ['nous', 'nous'],
  ['opencode', 'opencode'],
  ['openrouter', 'openrouter'],
]) {
  check(`live alias ${key} -> ${id}`, resolveIdentity(key).id, id);
}

/* -------------------------------------------------------------------------- */
console.log('\n--- assertion 3: simulation config ids ---\n');

for (const [key, id] of [
  ['gemini-2.5-pro', 'gemini'],
  ['claude-sonnet-4-5', 'anthropic'],
  ['gpt-5-1', 'openai'],
  ['llama-3-3-70b', 'ollama'],
]) {
  check(`simulation alias ${key} -> ${id}`, resolveIdentity(key).id, id);
}

/* -------------------------------------------------------------------------- */
console.log('\n--- assertion 4: the face box is never breached ---\n');

for (const [id, parts] of Object.entries(SHELLS)) {
  for (const part of parts) {
    check(`shell ${id}/${part.id} stays out of the face`, overlaps(aabb(part), FACE_BOX), false);
  }
}
for (const [id, parts] of Object.entries(TOPPERS)) {
  for (const part of parts) {
    check(`topper ${id}/${part.id} stays out of the face`, overlaps(aabb(part), FACE_BOX), false);
  }
}
for (const [id, parts] of Object.entries(EMBLEMS)) {
  for (const part of parts) {
    check(`emblem ${id}/${part.id} stays out of the face`, overlaps(aabb(part), FACE_BOX), false);
  }
}

/* -------------------------------------------------------------------------- */
console.log('\n--- assertion 5: every identity part fits its envelope ---\n');

// The envelopes are the contract, not a convenience: a wider one lets a shell
// creep into the face or a topper into the name pill. Pinned here so widening
// one is a deliberate, visible edit.
check('shell envelope', SHELL_ENVELOPE, {
  min: [-0.56, -0.42, -0.32],
  max: [0.56, 0.62, 0.32],
});
check('topper envelope', TOPPER_ENVELOPE, {
  min: [-0.11, 0.24, -0.06],
  max: [0.11, 0.51, 0.06],
});
check('emblem envelope', EMBLEM_ENVELOPE, {
  min: [-0.24, 0.235, 0.243],
  max: [0.24, 0.565, 0.28],
});

for (const [id, parts] of Object.entries(SHELLS)) {
  for (const part of parts) {
    check(`shell ${id}/${part.id} fits the head envelope`, contains(SHELL_BOX, aabb(part)), true);
    check(`shell ${id}/${part.id} rides the head`, part.node, 'head');
  }
}
for (const [id, parts] of Object.entries(TOPPERS)) {
  for (const part of parts) {
    check(`topper ${id}/${part.id} fits the antenna envelope`, contains(TOPPER_BOX, aabb(part)), true);
    check(`topper ${id}/${part.id} rides the antenna`, part.node, 'antenna');
  }
}
for (const [id, parts] of Object.entries(EMBLEMS)) {
  for (const part of parts) {
    check(`emblem ${id}/${part.id} fits the belly panel`, contains(EMBLEM_BOX, aabb(part)), true);
    check(`emblem ${id}/${part.id} rides the torso`, part.node, 'torso');
    check(`emblem ${id}/${part.id} is unlit`, part.unlit, true);
  }
}

/* -------------------------------------------------------------------------- */
console.log('\n--- the ball is drawn by the rig, not by a part table ---\n');

check('TOPPERS.ball has no parts', TOPPERS.ball.length, 0);
check('EMBLEMS.none has no parts', EMBLEMS.none.length, 0);
check('SHELLS.box has no parts (the default body)', SHELLS.box.length, 0);
for (const id of Object.keys(TOPPERS)) {
  if (id === 'ball') continue;
  check(`topper ${id} has parts`, TOPPERS[id].length > 0, true);
}
for (const id of Object.keys(SHELLS)) {
  if (id === 'box') continue;
  check(`shell ${id} has parts`, SHELLS[id].length > 0, true);
}

/* -------------------------------------------------------------------------- */
console.log('\n--- assertion 8: identity never moves the body ---\n');

check('ROBOT_HEIGHT is still 2.365 m', Math.round(ROBOT_HEIGHT * 1000) / 1000, 2.365);
check(
  'robotBounds() ignores identity parts',
  Math.round(robotBounds().max[1] * 1000) / 1000,
  Math.round((robotNodePosition('antenna')[1] + ANTENNA_BALL.position[1] + ANTENNA_BALL.radius) * 1000) / 1000,
);
check(
  'robotBounds(extraParts) folds the extra parts in',
  Math.round(robotBounds(SHELLS.cat).max[1] * 1000) / 1000,
  Math.round(
    Math.max(robotBounds().max[1], robotNodePosition('head')[1] + aabb(SHELLS.cat[0]).max[1]) * 1000,
  ) / 1000,
);

/* -------------------------------------------------------------------------- */
console.log('\n--- envelope: derived from the shape tables, and above the ball ---\n');

const measured = identityBounds();
check('identityBounds().max[1] === ROBOT_ENVELOPE_TOP', measured.max[1], ROBOT_ENVELOPE_TOP);
check(
  'identityBounds().height === ROBOT_ENVELOPE_HEIGHT',
  Math.round(measured.height * 1000) / 1000,
  Math.round(ROBOT_ENVELOPE_HEIGHT * 1000) / 1000,
);
check(
  'envelope contains the whole neutral body',
  contains({ min: measured.min, max: measured.max }, { min: robotBounds().min, max: robotBounds().max }),
  true,
);
// A topper that never clears the ball would leave the envelope at the body's
// own top, and the name pill would keep sitting on the antenna — the bug this
// whole envelope exists to prevent.
check('envelope top clears the antenna ball', ROBOT_ENVELOPE_TOP > robotBounds().max[1], true);
check(
  'envelope top respects the topper box ceiling',
  ROBOT_ENVELOPE_TOP <= ANTENNA_TOP + TOPPER_BOX.max[1] + 1e-9,
  true,
);

/* -------------------------------------------------------------------------- */
console.log('\n--- identityPartsFor: tables only, never the base body ---\n');

const baseIds = new Set(ROBOT_PARTS.map((part) => part.id));
for (const identity of Object.values(IDENTITIES)) {
  const parts = identityPartsFor(identity);
  const leaked = parts.filter((part) => baseIds.has(part.id)).map((part) => part.id);
  check(`identityPartsFor(${identity.id}) adds no base part`, leaked, []);
  check(
    `identityPartsFor(${identity.id}) matches its tables`,
    parts.length,
    SHELLS[identity.shell].length + TOPPERS[identity.topper].length + EMBLEMS[identity.emblem].length,
  );
}

/* -------------------------------------------------------------------------- */
console.log('\n--- assertion 6: no two identities are twins ---\n');

const triples = Object.values(IDENTITIES).map(
  (identity) => `${identity.shell}|${identity.topper}|${identity.body}`,
);
check('no two identities share shell+topper+colour', new Set(triples).size, triples.length);

/* -------------------------------------------------------------------------- */
console.log('\n--- assertion 7: one source of colour ---\n');

for (const id of Object.keys(IDENTITIES)) {
  if (id === 'default') continue;
  check(`colour ${id} === body`, resolveIdentity(id).color, IDENTITIES[id].body);
}

/* -------------------------------------------------------------------------- */
console.log('\n--- unknown providers: distinct, stable, never default-bodied ---\n');

// Two foreign providers must not become twins: the office would show two
// identical robots and the colour is the only thing telling them apart.
check(
  'two unknown providers get different colours',
  resolveIdentity('zzz-unknown').color !== resolveIdentity('qqq-unknown').color,
  true,
);
check(
  'the same unknown provider resolves to the same colour',
  resolveIdentity('zzz-unknown').color,
  resolveIdentity('zzz-unknown').color,
);
check(
  'an unknown provider keeps the default body shape',
  [resolveIdentity('zzz-unknown').shell, resolveIdentity('zzz-unknown').topper],
  ['box', 'ball'],
);
check(
  'an unknown provider keeps its raw key as the label',
  resolveIdentity('zzz-unknown').label,
  'zzz-unknown',
);

// Every colour must be a hex literal: `resolveRobotColor` treats a leading '#'
// as a literal, and anything else would be looked up as a palette key and come
// back undefined.
const hexish = /^#[0-9a-fA-F]{6}$/;
for (const id of Object.keys(IDENTITIES)) {
  check(`${id} colour is #rrggbb`, hexish.test(resolveIdentity(id).color), true);
}

/* -------------------------------------------------------------------------- */
console.log('\n--- colour resolution: palette keys and hex literals ---\n');

check('hex literal passes through', resolveRobotColor('#2A2A33', '#5CB8F2'), '#2A2A33');
check('palette key still works', resolveRobotColor('cream', '#5CB8F2'), ROBOT_COLORS.cream);
check('body resolves to the accent', resolveRobotColor('body', '#5CB8F2'), '#5CB8F2');
check(
  'accent2 falls back to the accent it is given',
  resolveRobotColor('accent2', '#5CB8F2'),
  '#5CB8F2',
);

/* -------------------------------------------------------------------------- */
console.log('\n--- telemetry: the simulation roster carries real identities ---\n');

// `agents.ts` is imported here exactly the way `layout-check.mjs` imports it —
// straight through Node's type stripping. If a runtime import is ever added to
// it, this line is what breaks first, before `layout:test` does.
const { AGENT_CONFIGS } = await import('../src/lib/agents.ts');

for (const config of AGENT_CONFIGS) {
  check(`${config.id} declares an identity`, typeof config.identity, 'string');
  check(
    `${config.id} resolves to a known identity, not the default body`,
    resolveIdentity(config.identity).id !== 'default',
    true,
  );
  check(`${config.id} no longer carries accentColor`, 'accentColor' in config, false);
}

// The four simulation agents must not all look the same: they are the first
// thing anyone sees on load.
const simulationIdentities = AGENT_CONFIGS.map((config) => resolveIdentity(config.identity).id);
check(
  'the four simulation agents are four different providers',
  new Set(simulationIdentities).size,
  simulationIdentities.length,
);

/* -------------------------------------------------------------------------- */
console.log('\n--- aliases: normalised, unique, and non-empty for real identities ---\n');

const normalise = (key) => key.toLowerCase().replace(/[^a-z0-9]/g, '');

for (const [id, identity] of Object.entries(IDENTITIES)) {
  if (id === 'default') continue;
  check(`${id} declares at least one alias`, identity.aliases.length > 0, true);
  check(`${id} resolves from its own id`, resolveIdentity(id).id, id);
}

// A duplicate alias means one identity is unreachable — the resolver returns
// whichever entry the table happens to list first.
const seen = new Map();
for (const [id, identity] of Object.entries(IDENTITIES)) {
  for (const alias of identity.aliases) {
    const key = normalise(alias);
    const owner = seen.get(key);
    if (owner && owner !== id) {
      check(`alias "${alias}" is claimed by ${owner} and ${id}`, owner, id);
    }
    seen.set(key, id);
  }
}
check('no alias is claimed twice', seen.size, [...seen.keys()].length);

/* -------------------------------------------------------------------------- */
console.log('\n--- one owner for whatever sits on the antenna ---\n');

// The `.glb` bakes a yellow antenna ball; `<AntennaTopper>` also renders one for
// a `ball` identity. Two owners means two identical spheres at the same
// position for `default`/unknown providers, which z-fights instead of reading as
// one ball. This is an integration contract between two files, so it cannot be
// expressed by importing the tables — the sources are asserted directly.
const modelSource = readFileSync(new URL('../src/components/canvas/ModelRobot.tsx', import.meta.url), 'utf8');
const topperSource = readFileSync(new URL('../src/components/canvas/RobotParts.tsx', import.meta.url), 'utf8');

// `AntennaTopper` must own the ball case itself, so the baked mesh is redundant
// for every identity and can always be hidden.
check(
  'AntennaTopper renders the default ball',
  /identity\.topper === 'ball'/.test(topperSource),
  true,
);
check(
  'ModelRobot hides the baked antennaBall unconditionally',
  /const bakedBall = copy\.getObjectByName\('antennaBall'\);\s*\n\s*if \(bakedBall\) bakedBall\.visible = false;/.test(
    modelSource,
  ),
  true,
);
// A conditional hide is the exact regression: it re-exposes the duplicate ball
// for the one identity that still asks for a ball.
check(
  'ModelRobot does not gate the hide on the topper kind',
  /identity\.topper !== 'ball'/.test(modelSource),
  false,
);

/* -------------------------------------------------------------------------- */
console.log(`\n${total - failures}/${total} passed`);
if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('all provider identity rules behave as specified');
