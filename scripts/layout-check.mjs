// Layout regression test: the HUD panels must never overlap each other, and the
// control dock must never clip its own content, at any supported viewport.
//
// Usage: node scripts/layout-check.mjs
// Exits 1 if any viewport fails.
import { setTimeout as delay } from 'node:timers/promises';

const PORT = Number(process.env.CDP_PORT ?? 9224);
const URL = process.env.TARGET_URL ?? 'http://localhost:3001/?capture=1';

// Widths that matter: Tailwind breakpoints (md 768, lg 1024, xl 1280) and the
// common desktop sizes this dashboard is opened at.
const VIEWPORTS = [
  { w: 768, h: 900 },
  { w: 1024, h: 900 },
  { w: 1280, h: 800 },
  { w: 1440, h: 900 },
  { w: 1600, h: 1000 },
  { w: 1920, h: 1080 },
];

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const target = list.find((t) => t.type === 'page' && t.url.includes('localhost'));
if (!target) throw new Error('no app page target — is Chrome on CDP port ' + PORT + '?');

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

await send('Page.navigate', { url: URL });
await delay(3000);

const probe = `(() => {
  const rect = (el) => {
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) };
  };
  const visible = (el) => {
    if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };

  // Every top-level HUD panel. The dock is itself a .toy-card, so skip cards
  // nested inside another panel.
  const cards = [...document.querySelectorAll('.toy-card')].filter(
    (el) => visible(el) && !el.parentElement.closest('.toy-card'),
  );

  const nameOf = (el) =>
    el.getAttribute('aria-label') ||
    (el.textContent || '').trim().split('\\n')[0].slice(0, 24) ||
    el.className.toString().slice(0, 24);

  const panels = cards.map((el) => ({ name: nameOf(el), ...rect(el) }));

  const intersects = (a, b) =>
    a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

  const overlaps = [];
  for (let i = 0; i < panels.length; i++) {
    for (let j = i + 1; j < panels.length; j++) {
      if (intersects(panels[i], panels[j])) {
        const a = panels[i];
        const b = panels[j];
        overlaps.push({
          a: a.name,
          b: b.name,
          px: Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)),
        });
      }
    }
  }

  // Horizontal clipping inside the dock = cramped / unreadable controls.
  const dock = document.querySelector('[aria-label="Simulation mode control dock"]');
  const clipped = dock
    ? [...dock.querySelectorAll('*')]
        .filter((el) => el.scrollWidth > el.clientWidth + 1)
        .map((el) => (el.textContent || '').trim().slice(0, 24) || el.tagName)
    : [];

  return {
    vw: innerWidth,
    vh: innerHeight,
    panels,
    overlaps,
    clipped: [...new Set(clipped)],
    dock: dock ? rect(dock) : null,
  };
})()`;

let failures = 0;
for (const { w, h } of VIEWPORTS) {
  await send('Emulation.setDeviceMetricsOverride', {
    width: w,
    height: h,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await delay(800);
  const res = await send('Runtime.evaluate', { expression: probe, returnByValue: true });
  const d = res.result.value;
  const problems = [];
  if (d.overlaps.length) {
    problems.push(
      ...d.overlaps.map((o) => `OVERLAP ${o.a} <-> ${o.b} (${o.px}px)`),
    );
  }
  if (d.clipped.length) {
    problems.push(`CLIPPED inside dock: ${d.clipped.join(', ')}`);
  }
  const ok = problems.length === 0;
  if (!ok) failures++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'} ${String(d.vw).padStart(4)}x${String(d.vh).padEnd(4)} panels=${d.panels.length} dock=${d.dock ? `${d.dock.left}-${d.dock.right} h${d.dock.bottom - d.dock.top}` : 'none'}`,
  );
  for (const p of problems) console.log(`       ${p}`);
}

ws.close();
console.log(failures === 0 ? '\nAll viewports clean.' : `\n${failures} viewport(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
