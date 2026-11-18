// Task 4 screenshot pass: the four desktop viewports plus the 1023px breakpoint
// check. Also reports the acceptance facts from the brief as text, so the
// verdict does not depend on my eyeballing the images.
// Usage: node scripts/panel-shots.mjs
import { setTimeout as delay } from 'node:timers/promises';
import { writeFileSync, mkdirSync } from 'node:fs';

const PORT = Number(process.env.CDP_PORT ?? 9224);
const VIEWPORTS = [
  { w: 1280, h: 800 },
  { w: 1440, h: 900 },
  { w: 1600, h: 1000 },
  { w: 1920, h: 1080 },
  { w: 1023, h: 800 },
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

// Acceptance facts, measured rather than eyeballed.
const probe = `(() => {
  const vis = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1; };
  const panel = document.querySelector('aside[aria-label="Simulation panel"]');
  const dock = document.querySelector('[aria-label="Simulation mode control dock"]');
  const vitals = [...document.querySelectorAll('.toy-card')].find((c) => /^office vitals/i.test((c.textContent || '').trim()));
  const vr = vitals ? vitals.getBoundingClientRect() : null;
  const pr = panel ? panel.getBoundingClientRect() : null;
  const cards = [...document.querySelectorAll('.toy-card')].filter((el) => vis(el) && !el.parentElement.closest('.toy-card'));
  const overlaps = [];
  for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
    const a = cards[i].getBoundingClientRect(), b = cards[j].getBoundingClientRect();
    if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) {
      const n = (el) => ((el.textContent || '').trim().slice(0, 18) || el.getAttribute('aria-label') || el.tagName);
      overlaps.push(n(cards[i]) + ' <-> ' + n(cards[j]));
    }
  }
  const moodCells = (vis(panel) ? panel : dock) ? [...(vis(panel) ? panel : dock).querySelectorAll('button[aria-label^="Set "]')] : [];
  return {
    vw: innerWidth, vh: innerHeight,
    panelVisible: vis(panel),
    dockVisible: vis(dock),
    panelRight: pr ? Math.round(pr.right) : null,
    panelW: pr ? Math.round(pr.width) : null,
    panelClearOfVitals: !!(pr && vr) ? (pr.left >= vr.right || pr.right <= vr.left || pr.top >= vr.bottom || pr.bottom <= vr.top) : null,
    vitalsOnScreen: vr ? (vr.top >= 0 && vr.bottom <= innerHeight && vr.left >= 0 && vr.right <= innerWidth) : false,
    cardCount: cards.length,
    overlaps,
    moodCells: moodCells.length,
    cams: [...((vis(panel) ? panel : dock)?.querySelectorAll('[aria-label="Camera presets"] button') ?? [])].filter((b) => !b.disabled).length,
    docScrollW: document.documentElement.scrollWidth,
    docClientW: document.documentElement.clientWidth,
  };
})()`;

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
  const res = await send('Runtime.evaluate', { expression: probe, returnByValue: true });
  const d = res.result.value;
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`artifacts/panel-${w}x${h}.png`, Buffer.from(shot.data, 'base64'));

  const expectPanel = w >= 1024;
  const bpOk = d.panelVisible === expectPanel && d.dockVisible === !expectPanel;
  const ok = bpOk && d.overlaps.length === 0 && d.moodCells === 4 && d.cams === 3 && d.docScrollW <= d.docClientW + 1 && d.vitalsOnScreen;
  console.log(
    `${ok ? 'PASS' : 'FAIL'} ${w}x${h} panel=${d.panelVisible ? `on[w${d.panelW} right${d.panelRight}]` : 'off'} dock=${d.dockVisible ? 'on' : 'off'} ` +
      `breakpoint=${bpOk ? 'ok' : 'VIOLATED'} cards=${d.cardCount} overlaps=${d.overlaps.length ? d.overlaps.join('; ') : 'none'} ` +
      `mood=${d.moodCells}/4 cams=${d.cams}/3 vitalsOnScreen=${d.vitalsOnScreen} panelClearOfVitals=${d.panelClearOfVitals} ` +
      `hScroll=${d.docScrollW > d.docClientW + 1 ? 'YES' : 'no'} -> artifacts/panel-${w}x${h}.png`,
  );
}
ws.close();
