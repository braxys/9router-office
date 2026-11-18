// Capture a screenshot with an optional clip region (zoom into a scene area).
// Usage: node scripts/shot.mjs <name> [x] [y] [width] [height]
import { writeFileSync, mkdirSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

const PORT = Number(process.env.CDP_PORT ?? 9224);
const URL = process.env.TARGET_URL ?? 'http://localhost:3055/?capture=1';
const name = process.argv[2] ?? 'shot';
const [x, y, w, h] = process.argv.slice(3).map(Number);

mkdirSync('artifacts', { recursive: true });

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const target = list.find((t) => t.type === 'page' && t.url.includes('localhost'));
if (!target) throw new Error('no app page target');

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
    const { resolve } = pending.get(msg.id);
    pending.delete(msg.id);
    resolve(msg.result);
  }
};
function send(method, params = {}) {
  const msgId = ++id;
  ws.send(JSON.stringify({ id: msgId, method, params }));
  return new Promise((resolve) => pending.set(msgId, { resolve }));
}

// `?capture=1` makes the canvas keep its drawing buffer so the PNG is not black
// while the demand loop is idle.
await send('Page.navigate', { url: URL });
await delay(2500);

await send('Emulation.setDeviceMetricsOverride', {
  width: 1600,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
});
await delay(1200);

const params = { format: 'png' };
if (Number.isFinite(x) && Number.isFinite(w)) {
  params.clip = { x, y, width: w, height: h, scale: 2 };
}
const res = await send('Page.captureScreenshot', params);
writeFileSync(`artifacts/${name}.png`, Buffer.from(res.data, 'base64'));
console.log(`saved artifacts/${name}.png`);
ws.close();
