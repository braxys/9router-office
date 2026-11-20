// Capture the three README screenshots into docs/screenshots/.
//
// These are shipped assets, not scratch output, so they do not live under
// artifacts/. Each shot is taken at 1600x1000 with the canvas in `?capture=1`
// so the drawing buffer survives the demand loop and the PNG is not black.
//
// Usage: node scripts/readme-shots.mjs
//   CDP_PORT   Chrome debugging port   (default 9223)
//   TARGET_URL page to load            (default http://localhost:3001/?capture=1)
import { writeFileSync, mkdirSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

const PORT = Number(process.env.CDP_PORT ?? 9223);
const BASE = process.env.TARGET_URL ?? 'http://localhost:3001/?capture=1';
const OUT = 'docs/screenshots';
const VIEWPORT = { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false };

mkdirSync(OUT, { recursive: true });

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const target = list.find((t) => t.type === 'page');
if (!target) throw new Error(`no page target - is Chrome on CDP port ${PORT}?`);

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
    pending.get(msg.id).resolve(msg.result);
    pending.delete(msg.id);
  }
};
function send(method, params = {}) {
  const msgId = ++id;
  ws.send(JSON.stringify({ id: msgId, method, params }));
  return new Promise((resolve) => pending.set(msgId, { resolve }));
}

async function evaluate(expression) {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.text);
  return res.result.value;
}

async function load(url) {
  await send('Page.navigate', { url });
  // The canvas mounts behind a dynamic import and the camera flies to its
  // preset, so wait for the office to exist before measuring or shooting.
  for (let i = 0; i < 40; i++) {
    await delay(250);
    const ready = await evaluate(`!!window.__office && window.__office.robots.length > 0`);
    if (ready) break;
  }
  // Camera flight + telemetry settle. Two seconds of slack keeps the name pills
  // and vitals from landing mid-animation in the PNG.
  await delay(2200);
}

async function shot(name) {
  const res = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(res.data, 'base64'));
  console.log(`saved ${OUT}/${name}.png`);
}

await send('Emulation.setDeviceMetricsOverride', VIEWPORT);

// 1. Overview: default procedural bodies, panel open.
await load(BASE);
await shot('overview');

// 2. Collapsed rail: the panel folds to 56px and the camera gives the width back.
const folded = await evaluate(`(() => {
  const btn = document.querySelector('button[aria-label="Lipat panel simulasi"]');
  if (!btn) return 'no collapse button';
  btn.click();
  return 'clicked';
})()`);
if (folded !== 'clicked') throw new Error(`collapse failed: ${folded}`);
await delay(1800);
await shot('panel-collapsed');

// 3. Model rig: the same office rendered from the generated .glb.
await load(`${BASE}${BASE.includes('?') ? '&' : '?'}model=on`);
const body = await evaluate(`(() => {
  const robots = window.__office.robots;
  return robots.length ? (robots[0].object.getObjectByName('WorkerRobot') ? 'glb' : 'procedural') : 'none';
})()`);
if (body !== 'glb') throw new Error(`expected the .glb body, got ${body}`);
await shot('model-rig');

ws.close();
