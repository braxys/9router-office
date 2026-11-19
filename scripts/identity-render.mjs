// Render gate for the per-provider bot identity.
//
// The identity tables are unit-tested by `identity:test`, but that says nothing
// about whether the rig actually renders them: a shell could be authored,
// validated, and then never mounted because a node filter dropped it. This gate
// inspects the live three.js scene graph and asserts what a player would see.
//
// It runs against the same headless Chrome as `smoke.mjs` (CDP 9223) and needs
// `?capture=1`, which is what makes `Scene` publish the scene graph on
// `window.__office`.
//
// Usage: node scripts/identity-render.mjs      (npm run identity:render)
//   CDP_PORT=9223   TARGET_URL=http://localhost:3001
import { setTimeout as delay } from 'node:timers/promises';

const PORT = Number(process.env.CDP_PORT ?? 9223);
const URL = process.env.TARGET_URL ?? 'http://localhost:3001/?capture=1';

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

async function getJSON(path) {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

const version = await getJSON('/json/version');
console.log('Browser:', version.Browser);

const list = await getJSON('/json/list');
const target = list.find((t) => t.type === 'page');
if (!target) throw new Error(`no page target — is Chrome on CDP port ${PORT}?`);

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});

let id = 0;
const pending = new Map();
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
  }
};

function send(method, params = {}) {
  const msgId = ++id;
  ws.send(JSON.stringify({ id: msgId, method, params }));
  return new Promise((resolve, reject) => pending.set(msgId, { resolve, reject }));
}

async function evaluate(expression) {
  const res = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (res.exceptionDetails) {
    throw new Error(res.exceptionDetails.exception?.description ?? 'eval failed');
  }
  return res.result.value;
}

await send('Runtime.enable');
await send('Page.enable');
const VIEWPORT = {
  width: Number(process.env.VIEW_W ?? 1600),
  height: Number(process.env.VIEW_H ?? 1000),
  deviceScaleFactor: 1,
  mobile: false,
};
await send('Emulation.setDeviceMetricsOverride', VIEWPORT);
await send('Page.navigate', { url: URL });
await send('Page.bringToFront');
await send('Emulation.setFocusEmulationEnabled', { enabled: true });

// Wait for the scene graph to be published and populated.
const TIMEOUT_MS = 45000;
const started = Date.now();
let ready = false;
while (Date.now() - started < TIMEOUT_MS) {
  try {
    ready = await evaluate(`(() => {
      const o = window.__office;
      return !!(o && o.scene && o.robots && o.robots.length > 0);
    })()`);
  } catch {
    ready = false;
  }
  if (ready) break;
  await delay(500);
}
console.log(`scene ready: ${ready} after ${Date.now() - started}ms`);
if (!ready) {
  console.error(
    '\nFAIL: window.__office never appeared. Scene only publishes it under ' +
      '`?capture=1`; check the URL and that the canvas mounted.',
  );
  process.exit(1);
}
await delay(1500);

/* -------------------------------------------------------------------------- */
/*  What the scene graph actually contains                                    */
/* -------------------------------------------------------------------------- */

const report = await evaluate(`(() => {
  const office = window.__office;
  const meshNames = (root) => {
    const names = [];
    root.traverse((o) => { if (o.isMesh && o.name) names.push(o.name); });
    return names;
  };
  // Topmost screen-space Y reached by any head-mounted identity mesh (shell or
  // topper), in canvas-relative CSS pixels. Only the top edge matters: the shell
  // legitimately runs down past the chin, and the pill is supposed to sit above
  // the *silhouette*, not above every vertex.
  //
  // The name pill must not sit on top of that silhouette: at overview size the
  // pill is ~27px tall, which is 0.19 m of world at the desks, so a pill centred
  // on the envelope anchor covers the very thing the identity exists to show.
  const canvas = document.querySelector('canvas').getBoundingClientRect();
  const v = new (office.scene.position.constructor)();
  const project = (x, y, z) => {
    v.set(x, y, z).project(office.camera);
    return [(v.x + 1) / 2 * canvas.width + canvas.left, (1 - v.y) / 2 * canvas.height + canvas.top];
  };
  const identityTopY = (root) => {
    let top = Infinity;
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      if (!/^(shell|top)/.test(o.name)) return;
      const geom = o.geometry;
      if (!geom.boundingBox) geom.computeBoundingBox();
      const box = geom.boundingBox.clone().applyMatrix4(o.matrixWorld);
      for (const x of [box.min.x, box.max.x]) {
        for (const y of [box.min.y, box.max.y]) {
          for (const z of [box.min.z, box.max.z]) {
            top = Math.min(top, project(x, y, z)[1]);
          }
        }
      }
    });
    return top === Infinity ? null : Math.round(top);
  };
  const pills = [...document.querySelectorAll('[data-robot-pill]')].map((el) => {
    const r = el.getBoundingClientRect();
    return {
      // Match on the agent id, not the pill's text: the text is the name plus a
      // status label, so a name that prefixes another (OpenAI vs OpenAI Codex)
      // would pair a robot with a different robot's pill and the clearance check
      // would then pass against the wrong geometry.
      id: el.getAttribute('data-robot-pill'),
      text: el.textContent.trim().replace(/\\s+/g, ' '),
      left: Math.round(r.left), right: Math.round(r.right),
      top: Math.round(r.top), bottom: Math.round(r.bottom),
    };
  });
  return office.robots.map((r) => ({
    name: r.name,
    identity: r.identity,
    accentColor: r.accentColor,
    meshes: meshNames(r.object),
    // The pulse group is what makes any topper feel alive; without it the
    // provider bot would sit dead still where the default ball used to bounce.
    topperPulseGroups: (() => {
      let count = 0;
      r.object.traverse((o) => { if (o.userData && o.userData.topperPulse) count += 1; });
      return count;
    })(),
    // Visibility matters as much as existence: the glb body carries a baked
    // antennaBall that must be hidden whenever a topper replaces it.
    visibleAntennaBalls: (() => {
      let count = 0;
      r.object.traverse((o) => {
        if (o.isMesh && o.name === 'antennaBall' && o.visible) count += 1;
      });
      return count;
    })(),
    identityTopY: identityTopY(r.object),
    pill: pills.find((p) => p.id === r.id) ?? null,
  }));
})()`);

console.log('\n=== ROBOTS ON STAGE ===');
for (const robot of report) {
  console.log(
    `  ${robot.name} [${robot.identity}] ${robot.accentColor} ` +
      `meshes=${robot.meshes.length} pulse=${robot.topperPulseGroups} balls=${robot.visibleAntennaBalls}`,
  );
}

/* -------------------------------------------------------------------------- */
console.log('\n--- every robot on stage renders its own identity ---\n');

check('four robots are on stage', report.length, 4);

// Distinct providers must not be twins. `identity` is the id the resolver chose,
// so four distinct ids is exactly "four different bots".
const identities = report.map((robot) => robot.identity);
check('the four robots have four different identities', new Set(identities).size, identities.length);

for (const robot of report) {
  // The default body is the only identity allowed to show the yellow ball.
  check(
    `${robot.name} [${robot.identity}] antenna ball visibility matches its topper`,
    robot.visibleAntennaBalls,
    robot.identity === 'default' ? 1 : 0,
  );
  check(`${robot.name} has exactly one pulsing topper`, robot.topperPulseGroups, 1);
}

// Each known identity must contribute at least one named shell/topper/emblem
// mesh. A shell authored but never mounted is the failure this gate exists for.
const EXPECTED_PREFIXES = ['shell', 'top', 'em'];
for (const robot of report) {
  if (robot.identity === 'default') {
    check(`${robot.name} [default] adds no identity meshes`, 
      robot.meshes.filter((name) => EXPECTED_PREFIXES.some((p) => name.startsWith(p))).length,
      0,
    );
    continue;
  }
  const identityMeshes = robot.meshes.filter((name) =>
    EXPECTED_PREFIXES.some((prefix) => name.startsWith(prefix)),
  );
  check(`${robot.name} [${robot.identity}] mounts identity meshes`, identityMeshes.length > 0, true);
}

/* -------------------------------------------------------------------------- */
console.log('\n--- the name pill never covers the identity ---\n');

// The pill is the one piece of UI that sits above every bot. A shell or topper
// hidden behind it is an identity that exists only in the part tables.
for (const robot of report) {
  if (robot.identityTopY === null) {
    check(`${robot.name} [${robot.identity}] has identity geometry to measure`, false, true);
    continue;
  }
  const p = robot.pill;
  check(`${robot.name} [${robot.identity}] has a name pill`, p !== null, true);
  if (!p) continue;
  // A pixel of slack absorbs the pill's own 1px border rounding.
  const overlaps = p.bottom > robot.identityTopY + 1;
  check(
    `${robot.name} [${robot.identity}] pill clears its topper ` +
      `(pill bottom y${p.bottom}, identity top y${robot.identityTopY})`,
    overlaps,
    false,
  );
}

/* -------------------------------------------------------------------------- */
console.log('\n--- the body colour is the identity colour ---\n');

for (const robot of report) {
  check(`${robot.name} has a hex accent colour`, /^#[0-9a-fA-F]{6}$/.test(robot.accentColor), true);
}

/* -------------------------------------------------------------------------- */
console.log(`\n${total - failures}/${total} passed`);
ws.close();
if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('every bot on stage renders its own identity');
