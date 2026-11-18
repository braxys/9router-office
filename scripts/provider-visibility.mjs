// Does the provider list show every provider without scrolling?
// Usage: node scripts/provider-visibility.mjs
import { setTimeout as delay } from 'node:timers/promises';

const PORT = Number(process.env.CDP_PORT ?? 9224);
// Includes a short viewport: the panel itself may scroll, but the provider list
// must never be the thing hiding a row.
const VIEWPORTS = [
  { w: 1280, h: 600 },
  { w: 1280, h: 800 },
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

const probe = `(() => {
  const sec = [...document.querySelectorAll('section')].find((s) => s.getAttribute('aria-label') === 'Pilih provider');
  if (!sec) return { error: 'no provider section' };
  const rows = [...sec.querySelectorAll('button')];
  // The list container is whatever holds the rows. It used to be found by its
  // .toy-scroll class, but the cap was removed so every provider stays visible;
  // the parent of the first row is the stable anchor now.
  const list = rows[0]?.parentElement ?? sec;
  const box = list.getBoundingClientRect();
  const panel = document.querySelector('aside[aria-label="Simulation panel"]');
  const pbox = panel ? panel.getBoundingClientRect() : box;
  const hidden = rows.filter((r) => {
    const rb = r.getBoundingClientRect();
    // Outside the list, or scrolled out of the panel's visible area.
    return rb.bottom > box.bottom + 1 || rb.top < box.top - 1 || rb.bottom > pbox.bottom + 1 || rb.top < pbox.top - 1;
  }).map((r) => r.textContent.trim().slice(0, 20));
  return {
    vw: innerWidth,
    vh: innerHeight,
    rows: rows.length,
    visibleRows: rows.length - hidden.length,
    hiddenRows: hidden,
    scrollH: Math.round(list.scrollHeight),
    clientH: Math.round(list.clientHeight),
    scrollable: list.scrollHeight > list.clientHeight + 1,
  };
})()`;

let failures = 0;
for (const { w, h } of VIEWPORTS) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await delay(900);
  const res = await send('Runtime.evaluate', { expression: probe, returnByValue: true });
  const d = res.result.value;
  if (d.error) {
    console.log(`ERROR ${w}x${h}: ${d.error}`);
    failures++;
    continue;
  }
  const ok = d.hiddenRows.length === 0;
  if (!ok) failures++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'} ${String(d.vw).padStart(4)}x${String(d.vh).padEnd(4)} rows=${d.rows} visible=${d.visibleRows} scroll=${d.scrollH}/${d.clientH}${d.hiddenRows.length ? ' HIDDEN: ' + d.hiddenRows.join(' | ') : ''}`,
  );
}
ws.close();
console.log(failures === 0 ? '\nAll viewports show every provider.' : `\n${failures} viewport(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
