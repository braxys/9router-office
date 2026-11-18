// Phone-width regression probe: does the dock overlap the top HUD cards?
// Usage: node scripts/dock-phone.mjs
import { setTimeout as delay } from 'node:timers/promises';

const PORT = Number(process.env.CDP_PORT ?? 9224);
const VIEWPORTS = [
  { w: 375, h: 568 },
  { w: 375, h: 500 },
  { w: 320, h: 568 },
  { w: 360, h: 590 },
  { w: 375, h: 800 },
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

const probe = `(() => {
  const rect = (el) => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), h: Math.round(r.height) }; };
  const dock = document.querySelector('[aria-label="Simulation mode control dock"]');
  const cards = [...document.querySelectorAll('.toy-card')];
  const pick = (label) => {
    const el = cards.find((c) => c.textContent.trim().startsWith(label));
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1 ? rect(el) : null;
  };
  const vitals = pick('Office vitals') || pick('OFFICE VITALS');
  const ident = pick('9Router Office');
  const d = dock ? rect(dock) : null;
  const hit = (a, b) => !!a && !!b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  return {
    vw: innerWidth,
    vh: innerHeight,
    dock: d,
    dockOffscreen: d ? d.top < 0 : false,
    vitals,
    ident,
    hitVitals: hit(d, vitals),
    hitIdent: hit(d, ident),
    overlapVitalsPx: hit(d, vitals) ? Math.min(d.bottom, vitals.bottom) - Math.max(d.top, vitals.top) : 0,
    overlapIdentPx: hit(d, ident) ? Math.min(d.bottom, ident.bottom) - Math.max(d.top, ident.top) : 0,
  };
})()`;

let fails = 0;
for (const { w, h } of VIEWPORTS) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await delay(900);
  const res = await send('Runtime.evaluate', { expression: probe, returnByValue: true });
  const d = res.result.value;
  const bad = d.hitVitals || d.hitIdent || d.dockOffscreen;
  if (bad) fails++;
  console.log(
    `${bad ? 'FAIL' : 'PASS'} ${d.vw}x${d.vh} dock[h=${d.dock?.h} top=${d.dock?.top}] vitals=${d.vitals ? 'y' : 'n'} ident=${d.ident ? 'y' : 'n'}` +
      `${d.hitVitals ? ` OVERLAP_VITALS=${d.overlapVitalsPx}px` : ''}` +
      `${d.hitIdent ? ` OVERLAP_IDENT=${d.overlapIdentPx}px` : ''}` +
      `${d.dockOffscreen ? ' DOCK_OFFSCREEN' : ''}`,
  );
}
console.log(fails === 0 ? '\nAll phone viewports clean.' : `\n${fails} viewport(s) failed.`);
process.exit(fails === 0 ? 0 : 1);
