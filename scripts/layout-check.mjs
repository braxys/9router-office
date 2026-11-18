// Layout regression test for the HUD, including the simulation side panel.
//
// One gate for every layout invariant this dashboard depends on:
//
//   1. no two top-level `.toy-card` panels overlap;
//   2. exactly one control surface is visible — the side panel at >= 1024px,
//      the dock below it — never both, never neither;
//   3. the panel never overlaps Office Vitals, the identity card or Robot
//      Spotlight;
//   4. nothing inside the panel clips vertically (the `ProviderPicker` max-h
//      bug that hid the 4th provider) or horizontally (the `STREAMING` label
//      bug), and the four mood labels are never truncated;
//   5. all provider rows are visible in the panel without scrolling;
//   6. the dock never overlaps the top HUD and keeps its header on screen;
//   7. all three camera presets are visible and enabled, and all four mood
//      cells are reachable, on whichever surface is visible.
//
// Usage: node scripts/layout-check.mjs        (npm run layout:test)
//   CDP_PORT=9224            CDP port of the headless Chrome
//   TARGET_URL=...           page to load
// Exits 1 if any viewport fails.
import { setTimeout as delay } from 'node:timers/promises';

const PORT = Number(process.env.CDP_PORT ?? 9224);
const URL = process.env.TARGET_URL ?? 'http://localhost:3001/?capture=1';

/** Tailwind `lg`: the side panel takes over from here, the dock below it. */
const LG = 1024;

/**
 * Phone widths and short landscape sizes that already produced bugs, both
 * sides of every breakpoint this HUD reacts to (sm 640, md 768, lg 1024,
 * xl 1280), plus the desktop sizes the dashboard is opened at. 768x320 is the
 * landscape case where the dock clips its mood grid; 375x500 is the shortest
 * phone that has to keep the dock usable; 640x568 is the first width where the
 * dock's mood grid stops being a single-column scroll.
 */
const VIEWPORTS = [
  { w: 320, h: 568 },
  { w: 360, h: 590 },
  { w: 375, h: 500 },
  { w: 375, h: 568 },
  { w: 375, h: 800 },
  { w: 640, h: 568 },
  { w: 768, h: 320 },
  { w: 768, h: 900 },
  { w: 1024, h: 600 },
  { w: 1024, h: 900 },
  { w: 1280, h: 600 },
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

// The mood cells run `animate-toy-pop`, a 1.04 scale that inflates the box
// `getBoundingClientRect()` reports (153.5px -> 160.8px, 61 -> 63.9px) while it
// runs. A transform cannot move anything in the layout flow, so the settled box
// is the true layout box — but the assertions below compare those inflated
// rectangles against 1px tolerances, so a purely visual effect could fail a page
// that is actually correct. Measure with motion reduced and the noise is gone;
// the app already honours the preference (globals.css). Per-session, and it
// survives setDeviceMetricsOverride, so once before the first navigation is
// enough. No cleanup needed: this script closes the socket on the way out.
await send('Emulation.setEmulatedMedia', {
  features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
});

await send('Page.navigate', { url: URL });
await delay(3000);

/**
 * Everything is measured in the page and asserted here, so a failure message
 * can quote the numbers that produced it.
 */
const probe = `(() => {
  const TOL = 1;
  const px = (n) => Math.round(n);
  const rect = (el) => {
    const r = el.getBoundingClientRect();
    return { top: px(r.top), bottom: px(r.bottom), left: px(r.left), right: px(r.right), w: px(r.width), h: px(r.height) };
  };
  const visible = (el) => {
    if (!el) return false;
    if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };
  const css = (el) => getComputedStyle(el);
  const clips = (el) => {
    const s = css(el);
    return s.overflowX !== 'visible' || s.overflowY !== 'visible';
  };
  const scrollsY = (el) => {
    const s = css(el);
    return (s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + TOL;
  };
  const scrollsX = (el) => {
    const s = css(el);
    return (s.overflowX === 'auto' || s.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + TOL;
  };
  const isSrOnly = (el) => !!el.closest('.sr-only');
  const text = (el) => (el.textContent || '').replace(/\\s+/g, ' ').trim();

  /**
   * The box the user can actually see this element in: scroll, then clamp,
   * then restore.
   *
   * Non-strict, the three steps are literal. 1. Scroll: walking outwards, every
   * clipping ancestor that really scrolls the axis the element overflows is
   * scrolled by the minimum delta that brings the element inside its client
   * box, and the previous scrollTop/scrollLeft are remembered. 2. Clamp: the
   * visible box is the viewport narrowed by every clipping ancestor that is not
   * a usable scroller for this element — either because it does not scroll that
   * axis at all, or because it scrolls it but the trial scroll still could not
   * fit the element in (content beyond its scroll range). A scroller is thus a
   * path rather than a limit, including one nested inside an overflow-hidden
   * box, which is exactly the dock: the section clips, the mood pane inside it
   * scrolls, and the cells are reachable through the pane. 3. Restore: every
   * touched scroller is put back in a finally, innermost first, so no probe can
   * leave the page scrolled for the next measurement.
   *
   * Strict skips steps 1 and 3 entirely and clamps at every clipping ancestor:
   * no scrolling, nothing touched. That is the "visible right now" test used for
   * controls that must never need a scroll.
   *
   * rect is the element box measured between steps 1 and 3, i.e. in the same
   * state the bounds describe, so describeReach compares like with like.
   */
  const reachable = (el, strict) => {
    const touched = [];
    try {
      if (!strict) {
        for (let a = el.parentElement; a; a = a.parentElement) {
          if (!clips(a)) continue;
          const ay = scrollsY(a);
          const ax = scrollsX(a);
          if (!ay && !ax) continue;
          const r = el.getBoundingClientRect();
          const ar = a.getBoundingClientRect();
          let dy = 0, dx = 0;
          if (ay) {
            if (r.top < ar.top) dy = r.top - ar.top;
            else if (r.bottom > ar.bottom) dy = r.bottom - ar.bottom;
          }
          if (ax) {
            if (r.left < ar.left) dx = r.left - ar.left;
            else if (r.right > ar.right) dx = r.right - ar.right;
          }
          if (!dy && !dx) continue;
          touched.push([a, a.scrollTop, a.scrollLeft]);
          a.scrollTop += dy;
          a.scrollLeft += dx;
        }
      }
      const r = el.getBoundingClientRect();
      let top = 0, bottom = innerHeight, left = 0, right = innerWidth;
      for (let a = el.parentElement; a; a = a.parentElement) {
        if (!clips(a)) continue;
        const ar = a.getBoundingClientRect();
        // A scroller is exempt only on an axis it actually scrolls *and* on
        // which the trial scroll did put the element inside it. One that cannot
        // reach its own content (content taller than its scroll range) is still
        // a limit, so the gate can never pass an element nobody can see.
        const fitsY = r.top >= ar.top - TOL && r.bottom <= ar.bottom + TOL;
        const fitsX = r.left >= ar.left - TOL && r.right <= ar.right + TOL;
        if (strict || !scrollsY(a) || !fitsY) { top = Math.max(top, ar.top); bottom = Math.min(bottom, ar.bottom); }
        if (strict || !scrollsX(a) || !fitsX) { left = Math.max(left, ar.left); right = Math.min(right, ar.right); }
      }
      return {
        ok: r.top >= top - TOL && r.bottom <= bottom + TOL && r.left >= left - TOL && r.right <= right + TOL,
        top: px(top), bottom: px(bottom), left: px(left), right: px(right),
        rect: rect(el),
      };
    } finally {
      // Restore innermost-first. Each restore is individually guarded so one
      // failure cannot leave the rest of the page scrolled (and cannot mask an
      // error thrown by the walk itself).
      for (const [a, st, sl] of touched.reverse()) {
        try { a.scrollTop = st; a.scrollLeft = sl; } catch {}
      }
    }
  };

  const intersects = (a, b) =>
    a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

  // Every top-level HUD panel. The dock and the panel are themselves
  // toy-cards, so skip cards nested inside another card.
  const cards = [...document.querySelectorAll('.toy-card')].filter(
    (el) => visible(el) && !el.parentElement.closest('.toy-card'),
  );
  const nameOf = (el) => {
    const t = text(el);
    if (/^office vitals/i.test(t)) return 'Office vitals';
    if (/^9router office/i.test(t)) return 'identity card';
    if (/^robot spotlight/i.test(t)) return 'Robot spotlight';
    return el.getAttribute('aria-label') || t.slice(0, 24) || el.tagName;
  };
  const panels = cards.map((el) => ({ name: nameOf(el), ...rect(el) }));
  const cardNamed = (name) => cards.find((c) => nameOf(c) === name) ?? null;
  const vitals = cardNamed('Office vitals');
  const identity = cardNamed('identity card');
  const spotlight = cardNamed('Robot spotlight');

  const panel = document.querySelector('aside[aria-label="Simulation panel"]');
  const dock = document.querySelector('[aria-label="Simulation mode control dock"]');
  const panelVisible = visible(panel);
  const dockVisible = visible(dock);
  const surface = panelVisible ? panel : dockVisible ? dock : null;
  const surfaceName = panelVisible ? 'panel' : dockVisible ? 'dock' : 'none';

  /**
   * Element-level clipping scan. An element that scrolls its own overflow is
   * exempt (that is the intended design); everything else must fit.
   * .sr-only is a 1x1 box by design and is excluded. Single-line truncate
   * spans are excluded from the horizontal scan only — long names may legally
   * ellipsize — and the mood labels that must never truncate are asserted
   * separately below, because that exemption is exactly what hid the
   * STREAMING defect once.
   */
  const scanClipping = (root) => {
    const vertical = [];
    const horizontal = [];
    for (const el of root.querySelectorAll('*')) {
      if (isSrOnly(el)) continue;
      if (el.scrollHeight > el.clientHeight + TOL && !scrollsY(el)) {
        vertical.push({ tag: el.tagName, text: text(el).slice(0, 24), scroll: el.scrollHeight, client: el.clientHeight });
      }
      if (el.scrollWidth > el.clientWidth + TOL && !scrollsX(el)) {
        const s = css(el);
        const singleLineTruncate = s.textOverflow === 'ellipsis' && s.whiteSpace === 'nowrap';
        if (!singleLineTruncate) {
          horizontal.push({ tag: el.tagName, text: text(el).slice(0, 24), scroll: el.scrollWidth, client: el.clientWidth });
        }
      }
    }
    return { vertical, horizontal };
  };

  // The pre-existing dock check: any horizontal overflow at all is a failure.
  const dockOverflow = dockVisible
    ? [...dock.querySelectorAll('*')]
        .filter((el) => el.scrollWidth > el.clientWidth + TOL)
        .map((el) => text(el).slice(0, 24) || el.tagName)
    : [];

  // Four mood triggers, on whichever surface is on screen.
  const moodButtons = surface ? [...surface.querySelectorAll('button[aria-label^="Set "]')] : [];
  const mood = moodButtons.map((button) => {
    const span = button.querySelector(':scope > span:first-child > span.truncate');
    return {
      name: button.getAttribute('aria-label'),
      // Mood cells may live in a scroller (the dock on a short phone), so a
      // scrollable ancestor is an acceptable path to them — see reachable().
      reach: reachable(button, false),
      labelSpan: span
        ? { text: text(span), scroll: span.scrollWidth, client: span.clientWidth }
        : null,
    };
  });

  // Provider rows: every row must be visible in the panel without scrolling
  // it, so this uses the strict test — the panel itself must not need to
  // scroll to reveal a provider (the old max-h-[104px] bug).
  const panelBox = panelVisible ? rect(panel) : null;
  const providerSection = panelVisible ? panel.querySelector('section[aria-label="Pilih provider"]') : null;
  const providers = providerSection
    ? [...providerSection.querySelectorAll('button')].map((row) => {
        const reach = reachable(row, true);
        const r = rect(row);
        const inPanel =
          !!panelBox &&
          r.top >= panelBox.top - TOL &&
          r.bottom <= panelBox.bottom + TOL &&
          r.left >= panelBox.left - TOL &&
          r.right <= panelBox.right + TOL;
        return { name: text(row).slice(0, 18), rect: r, inPanel, reach };
      })
    : [];

  // Camera presets on whichever surface is on screen. The presets are the
  // only way to move the camera, so they must be on screen without scrolling.
  const cameraGroup = surface ? surface.querySelector('[aria-label="Camera presets"]') : null;
  const cameras = cameraGroup
    ? [...cameraGroup.querySelectorAll('button')].map((button) => ({
        name: button.getAttribute('aria-label'),
        disabled: button.disabled || button.getAttribute('aria-disabled') === 'true',
        reach: reachable(button, true),
      }))
    : [];

  const dockHeader = dockVisible ? dock.querySelector('header') : null;

  return {
    vw: innerWidth,
    vh: innerHeight,
    panels,
    vitals: vitals ? rect(vitals) : null,
    identity: identity ? rect(identity) : null,
    spotlight: spotlight ? rect(spotlight) : null,
    panel: panelVisible
      ? {
          ...rect(panel),
          scrollHeight: panel.scrollHeight,
          clientHeight: panel.clientHeight,
          reach: reachable(panel, true),
        }
      : null,
    dock: dockVisible
      ? {
          ...rect(dock),
          scrollHeight: dock.scrollHeight,
          clientHeight: dock.clientHeight,
          reach: reachable(dock, true),
          header: dockHeader ? { ...rect(dockHeader), reach: reachable(dockHeader) } : null,
        }
      : null,
    surface: surfaceName,
    panelClipping: panelVisible ? scanClipping(panel) : { vertical: [], horizontal: [] },
    dockOverflow: [...new Set(dockOverflow)],
    providers,
    mood,
    cameras,
  };
})()`;

const intersects = (a, b) =>
  !!a && !!b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const overlapSize = (a, b) =>
  intersects(a, b)
    ? `${Math.min(a.right, b.right) - Math.max(a.left, b.left)}x${Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)}px`
    : null;
const describeReach = (r) => {
  const bits = [];
  if (r.rect.top < r.top - 1) bits.push(`top ${r.rect.top} < ${r.top}`);
  if (r.rect.bottom > r.bottom + 1) bits.push(`bottom ${r.rect.bottom} > ${r.bottom}`);
  if (r.rect.left < r.left - 1) bits.push(`left ${r.rect.left} < ${r.left}`);
  if (r.rect.right > r.right + 1) bits.push(`right ${r.rect.right} > ${r.right}`);
  return bits.join(', ');
};

/**
 * Pre-existing, out-of-scope defect: the identity card and Office Vitals
 * overlap each other below `sm` (167x74px at 375x568) because the identity
 * card is `min(90vw, 340px)` wide and both are pinned to the same top row.
 * Ruled out of scope in the Task 2 review; reported as KNOWN on every phone
 * viewport instead of being asserted, so it cannot be forgotten. Every other
 * pair — including anything involving the panel or the dock — stays strict.
 */
const KNOWN_OVERLAP = { a: 'identity card', b: 'Office vitals', belowWidth: 640 };

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
  const known = [];
  const expectPanel = w >= LG;
  let hudHits = 0;

  // 1. Pairwise non-overlap of every top-level card (panel and dock included).
  for (let i = 0; i < d.panels.length; i++) {
    for (let j = i + 1; j < d.panels.length; j++) {
      const a = d.panels[i];
      const b = d.panels[j];
      const size = overlapSize(a, b);
      if (!size) continue;
      const isKnownPair =
        w < KNOWN_OVERLAP.belowWidth &&
        ((a.name === KNOWN_OVERLAP.a && b.name === KNOWN_OVERLAP.b) ||
          (a.name === KNOWN_OVERLAP.b && b.name === KNOWN_OVERLAP.a));
      if (isKnownPair) known.push(`OVERLAP ${a.name} <-> ${b.name} ${size} (pre-existing, out of scope)`);
      else problems.push(`OVERLAP ${a.name} <-> ${b.name} ${size}`);
    }
  }

  // 2. Breakpoint invariant: exactly one surface, on the correct side of lg.
  if (d.panel && d.dock) problems.push('BREAKPOINT both panel and dock visible');
  if (!d.panel && !d.dock) problems.push('BREAKPOINT neither panel nor dock visible');
  if (expectPanel && !d.panel) problems.push(`BREAKPOINT panel hidden at ${w}px (lg=${LG})`);
  if (!expectPanel && d.panel) problems.push(`BREAKPOINT panel visible at ${w}px (lg=${LG})`);
  if (expectPanel && d.dock) problems.push(`BREAKPOINT dock visible at ${w}px (lg=${LG})`);
  if (!expectPanel && !d.dock) problems.push(`BREAKPOINT dock hidden at ${w}px (lg=${LG})`);
  // Whichever surface won must itself be on screen, not pushed past an edge.
  if (d.panel && !d.panel.reach.ok) problems.push(`PANEL OFF-SCREEN ${describeReach(d.panel.reach)}`);
  if (d.dock && !d.dock.reach.ok) problems.push(`DOCK OFF-SCREEN ${describeReach(d.dock.reach)}`);

  // 3. The panel must never paint over the top HUD.
  for (const [name, card] of [
    ['Office vitals', d.vitals],
    ['identity card', d.identity],
    ['Robot spotlight', d.spotlight],
  ]) {
    if (!d.panel) break;
    const size = overlapSize(d.panel, card);
    if (size) {
      problems.push(`PANEL OVERLAPS ${name} ${size}`);
      hudHits++;
    }
  }
  if (!d.vitals) problems.push('Office Vitals card not found');
  if (!d.identity) problems.push('identity card not found');

  // 4. Nothing inside the panel clips.
  for (const c of d.panelClipping.vertical) {
    problems.push(`PANEL VERTICAL CLIP ${c.tag} "${c.text}" scrollH ${c.scroll} > clientH ${c.client}`);
  }
  for (const c of d.panelClipping.horizontal) {
    problems.push(`PANEL HORIZONTAL CLIP ${c.tag} "${c.text}" scrollW ${c.scroll} > clientW ${c.client}`);
  }

  // 5. Every provider row visible in the panel without scrolling it.
  if (d.panel) {
    if (d.providers.length < 4) {
      problems.push(`PROVIDERS only ${d.providers.length} rows rendered (expected 4)`);
    }
    for (const row of d.providers) {
      if (!row.reach.ok) {
        problems.push(`PROVIDER HIDDEN "${row.name}" ${describeReach(row.reach)}`);
      } else if (!row.inPanel) {
        problems.push(
          `PROVIDER OUTSIDE PANEL "${row.name}" y${row.rect.top}-${row.rect.bottom} vs panel y${d.panel.top}-${d.panel.bottom}`,
        );
      }
    }
  }

  // 6. The dock must not cover the top HUD and must keep its header on screen.
  if (d.dock) {
    for (const [name, card] of [
      ['Office vitals', d.vitals],
      ['identity card', d.identity],
      ['Robot spotlight', d.spotlight],
    ]) {
      const size = overlapSize(d.dock, card);
      if (size) {
        problems.push(`DOCK OVERLAPS ${name} ${size}`);
        hudHits++;
      }
    }
    if (!d.dock.header) {
      problems.push('DOCK header not found');
    } else {
      if (!d.dock.header.reach.ok) {
        problems.push(`DOCK HEADER OFF-SCREEN ${describeReach(d.dock.header.reach)}`);
      }
      if (d.dock.scrollHeight > d.dock.clientHeight + 1) {
        problems.push(`DOCK CLIPS ITS CONTENT scrollH ${d.dock.scrollHeight} > clientH ${d.dock.clientHeight}`);
      }
    }
  }
  if (d.dockOverflow.length) {
    problems.push(`CLIPPED inside dock: ${d.dockOverflow.join(', ')}`);
  }

  // 7. Four mood cells reachable, never truncated.
  if (d.mood.length !== 4) {
    problems.push(`MOOD expected 4 cells on the ${d.surface}, found ${d.mood.length}`);
  }
  for (const cell of d.mood) {
    if (!cell.reach.ok) problems.push(`MOOD CELL UNREACHABLE "${cell.name}" ${describeReach(cell.reach)}`);
    if (!cell.labelSpan) {
      problems.push(`MOOD LABEL missing on "${cell.name}"`);
    } else if (cell.labelSpan.scroll > cell.labelSpan.client + 1) {
      problems.push(
        `MOOD LABEL TRUNCATED "${cell.labelSpan.text}" scrollW ${cell.labelSpan.scroll} > clientW ${cell.labelSpan.client}`,
      );
    }
  }

  // 8. Three camera presets, visible and enabled.
  if (d.cameras.length !== 3) {
    problems.push(`CAMERAS expected 3 presets on the ${d.surface}, found ${d.cameras.length}`);
  }
  for (const cam of d.cameras) {
    if (cam.disabled) problems.push(`CAMERA DISABLED "${cam.name}"`);
    if (!cam.reach.ok) problems.push(`CAMERA UNREACHABLE "${cam.name}" ${describeReach(cam.reach)}`);
  }

  const ok = problems.length === 0;
  if (!ok) failures++;

  const surfaceText = d.panel
    ? `panel=on[${d.panel.left}-${d.panel.right},${d.panel.top}-${d.panel.bottom} sh${d.panel.scrollHeight}/ch${d.panel.clientHeight}]`
    : d.dock
      ? `dock=on[${d.dock.left}-${d.dock.right},${d.dock.top}-${d.dock.bottom} sh${d.dock.scrollHeight}/ch${d.dock.clientHeight}]`
      : 'panel=off dock=off';
  const moodOk = d.mood.filter((c) => c.reach.ok && c.labelSpan && c.labelSpan.scroll <= c.labelSpan.client + 1).length;
  const camOk = d.cameras.filter((c) => !c.disabled && c.reach.ok).length;
  const provOk = d.providers.filter((r) => r.reach.ok && r.inPanel).length;

  console.log(
    `${ok ? 'PASS' : 'FAIL'} ${String(d.vw).padStart(4)}x${String(d.vh).padEnd(4)} ` +
      `${surfaceText} cards=${d.panels.length} hudHits=${hudHits} ` +
      `providers=${provOk}/${d.providers.length} mood=${moodOk}/${d.mood.length} cams=${camOk}/${d.cameras.length} ` +
      `vclip=${d.panelClipping.vertical.length} hclip=${d.panelClipping.horizontal.length} ` +
      `dockOverflow=${d.dockOverflow.length}`,
  );
  for (const k of known) console.log(`       KNOWN ${k}`);
  for (const p of problems) console.log(`       ${p}`);
}

ws.close();
console.log(failures === 0 ? '\nAll viewports clean.' : `\n${failures} viewport(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
