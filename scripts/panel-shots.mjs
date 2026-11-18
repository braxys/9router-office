// Screenshot the app at the key viewports for visual confirmation of the side panel.
// Usage: node scripts/panel-shots.mjs
import { setTimeout as delay } from 'node:timers/promises';
import { writeFileSync, mkdirSync } from 'node:fs';

const PORT = Number(process.env.CDP_PORT ?? 9224);
const VIEWPORTS = [
  { w: 1023, h: 800 },
  { w: 1280, h: 800 },
  { w: 1440, h: 900 },
  { w: 1600, h: 1000 },
  { w: 1920, h: 1080 },
];

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const target = list.find((t) => t.type === 'page' && t.url.includes('localhost'));
if (!target) throw new Error('no app page target');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = rej;
});
let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id).resolve(m.result);
    pending.delete(m.id);
  }
};
const send = (method, params = {}) => {
  const msgId = ++id;
  ws.send(JSON.stringify({ id: msgId, method, params }));
  return new Promise((resolve) => pending.set(msgId, { resolve }));
};

await send('Page.navigate', { url: 'http://localhost:3001/?capture=1' });
await delay(4000);
mkdirSync('artifacts', { recursive: true });

for (const { w, h } of VIEWPORTS) {
  await send('Emulation.setDeviceMetricsOverride', {
    width: w,
    height: h,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await delay(1400);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`artifacts/panel-${w}x${h}.png`, Buffer.from(shot.data, 'base64'));
  console.log(`saved artifacts/panel-${w}x${h}.png`);
}
ws.close();
