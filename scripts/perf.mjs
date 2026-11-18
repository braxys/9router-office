// Measure the *rendered* frame rate of the 3D canvas (not the browser's rAF
// rate). The dynamic throttle should hold this at 30 FPS when every agent is
// idle and ~28 FPS when any agent is active.
//
// Usage: node scripts/perf.mjs [width] [height] [seconds] [--idle]
//
// `--idle` blocks /api/telemetry (so the bridge switches to Simulation Mode),
// then broadcasts IDLE to every robot. That is the only deterministic way to
// reach the all-idle state while the live dashboard is running.
import { setTimeout as delay } from 'node:timers/promises';

const PORT = Number(process.env.CDP_PORT ?? 9223);
const W = Number(process.argv[2] ?? 1600);
const H = Number(process.argv[3] ?? 1000);
const SECONDS = Number(process.argv[4] ?? 5);
const FORCE_IDLE = process.argv.includes('--idle');

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

// A backgrounded tab is throttled to 30 Hz rAF, which caps the frame count the
// probe can ever see and makes the measurement describe the harness rather than
// the app. Focus emulation keeps the tab rendering at full rate.
await send('Page.enable').catch(() => {});
await send('Page.bringToFront').catch(() => {});
await send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

await send('Emulation.setDeviceMetricsOverride', {
  width: W,
  height: H,
  deviceScaleFactor: 1,
  mobile: false,
});

// Count real draws: three.js calls gl.clear() once at the start of each frame.
// Patching the prototype reaches the already-created context.
const patched = await evaluate(`(() => {
  if (window.__frameProbe) return 'already';
  window.__frameProbe = { frames: 0 };
  for (const proto of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
    const orig = proto.clear;
    if (!orig) continue;
    proto.clear = function (...args) {
      window.__frameProbe.frames += 1;
      return orig.apply(this, args);
    };
  }
  return 'installed';
})()`);

if (FORCE_IDLE) {
  await send('Network.enable');
  await send('Network.setBlockedURLs', { urls: ['*api/telemetry*'] });
  await delay(2500); // let the next poll fail -> Simulation Mode
  const clicked = await evaluate(`(() => {
    const broadcast = [...document.querySelectorAll('button')].find((b) =>
      /^(Only |Everyone)/.test(b.textContent.trim()),
    );
    if (!broadcast) return 'no broadcast button';
    if (broadcast.textContent.trim().startsWith('Only ')) broadcast.click();
    return 'broadcast';
  })()`);
  if (clicked !== 'broadcast') throw new Error(`could not force idle: ${clicked}`);
  await delay(300); // let React apply the broadcast label
  const idled = await evaluate(`(() => {
    const idle = [...document.querySelectorAll('button')].find(
      (b) => b.getAttribute('aria-label') === 'Set all robots to IDLE',
    );
    if (!idle) return 'no idle button';
    idle.click();
    return 'idle';
  })()`);
  if (idled !== 'idle') throw new Error(`could not force idle: ${idled}`);
  await delay(1200);
} else {
  await delay(2500); // let resize + scene settle
}

const result = await evaluate(`new Promise((resolve) => {
  const startFrames = window.__frameProbe.frames;
  let rafFrames = 0;
  const start = performance.now();
  const onFrame = () => {
    rafFrames += 1;
    const now = performance.now();
    if (now - start < ${SECONDS * 1000}) {
      requestAnimationFrame(onFrame);
      return;
    }
    const elapsed = (now - start) / 1000;
    resolve({
      renderFps: +((window.__frameProbe.frames - startFrames) / elapsed).toFixed(1),
      rafFps: +(rafFrames / elapsed).toFixed(1),
      seconds: +elapsed.toFixed(2),
      idle: ${FORCE_IDLE},
      canvas: (() => { const c = document.querySelector('canvas'); return c ? [c.width, c.height] : null; })(),
      gpu: (() => {
        const c = document.querySelector('canvas');
        const gl = c && (c.getContext('webgl2') || c.getContext('webgl'));
        if (!gl) return null;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      })(),
      viewport: [innerWidth, innerHeight],
    });
  };
  requestAnimationFrame(onFrame);
})`);

if (FORCE_IDLE) {
  await send('Network.setBlockedURLs', { urls: [] });
}

console.log(JSON.stringify({ patched, ...result }, null, 2));
ws.close();
