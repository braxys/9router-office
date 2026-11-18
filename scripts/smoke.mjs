// Headless Chrome smoke test over the DevTools Protocol.
// Attaches to an already-running Chrome (--remote-debugging-port=9223),
// opens the app, captures console/page errors, and screenshots the scene.
import { writeFileSync, mkdirSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

const PORT = Number(process.env.CDP_PORT ?? 9223);
const URL = process.env.TARGET_URL ?? 'http://localhost:3001';
const OUT = 'artifacts';
const ACTIONS = process.argv.includes('--trigger-states');

mkdirSync(OUT, { recursive: true });

async function getJSON(path) {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

const version = await getJSON('/json/version');
console.log('Browser:', version.Browser);

// Reuse the blank tab or create a fresh one.
const list = await getJSON('/json/list');
let target = list.find((t) => t.type === 'page');
if (!target) {
  const created = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, {
    method: 'PUT',
  });
  target = await created.json();
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});

let id = 0;
const pending = new Map();
const consoleErrors = [];
const consoleWarnings = [];
const pageErrors = [];
const failedRequests = [];
const consoleAll = [];

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
    return;
  }
  if (msg.method === 'Runtime.consoleAPICalled') {
    const text = (msg.params.args ?? [])
      .map((a) => a.value ?? a.description ?? a.unserializableValue ?? '')
      .join(' ');
    consoleAll.push(`[${msg.params.type}] ${text}`);
    if (msg.params.type === 'error') consoleErrors.push(text);
    if (msg.params.type === 'warning') consoleWarnings.push(text);
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    pageErrors.push(d.exception?.description ?? d.text);
  }
  if (msg.method === 'Log.entryAdded') {
    const e = msg.params.entry;
    consoleAll.push(`[log:${e.level}] ${e.text}`);
    if (e.level === 'error') consoleErrors.push(e.text);
  }
  if (msg.method === 'Network.loadingFailed') {
    failedRequests.push(`${msg.params.type} ${msg.params.errorText}`);
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

async function shot(name) {
  const res = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(res.data, 'base64'));
  console.log(`saved ${OUT}/${name}.png`);
}

await send('Runtime.enable');
await send('Log.enable');
await send('Network.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 1600,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
});

await send('Page.navigate', { url: URL });
// A backgrounded tab is throttled and never lays the canvas out — it stays at
// the default 300x150 and reads as blank, which makes the gate lie. Bring the
// tab to the front and emulate focus so the screenshot and the pixel probe
// describe a page that is actually rendering.
await send('Page.bringToFront');
await send('Emulation.setFocusEmulationEnabled', { enabled: true });

// Wait for the app shell to actually mount (first compile can take ~10s+)
// instead of relying on a fixed sleep.
const READY_TIMEOUT_MS = 45000;
const readyStart = Date.now();
let ready = false;
while (Date.now() - readyStart < READY_TIMEOUT_MS) {
  try {
    ready = await evaluate(
      `!!document.body && (document.body.innerText || '').includes('Simulation Mode')`,
    );
  } catch {
    ready = false;
  }
  if (ready) break;
  await delay(500);
}
console.log(`app ready: ${ready} after ${Date.now() - readyStart}ms`);
// let the WebGL scene settle / animations reach steady state
await delay(3500);

const state = await evaluate(`(() => {
  const canvas = document.querySelector('canvas');
  const gl = canvas && (canvas.getContext('webgl2') || canvas.getContext('webgl'));
  const text = document.body.innerText || '';
  const buttons = [...document.querySelectorAll('button')];
  return {
    hasCanvas: !!canvas,
    canvasSize: canvas ? [canvas.width, canvas.height] : null,
    contextLost: gl ? gl.isContextLost() : 'no-gl-handle',
    canvasNonBlank: (() => {
      if (!canvas) return false;
      try {
        const c = document.createElement('canvas');
        c.width = 80; c.height = 50;
        const ctx = c.getContext('2d');
        ctx.drawImage(canvas, 0, 0, 80, 50);
        const d = ctx.getImageData(0, 0, 80, 50).data;
        let sum = 0;
        for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i+1] + d[i+2];
        return sum > 2000;
      } catch (e) { return 'err:' + e.message; }
    })(),
    bootingVisible: text.includes('Booting spatial core'),
    hasTitle: text.includes('9Router'),
    hasSimMode: text.includes('Simulation Mode'),
    states: ['IDLE','THINKING','STREAMING','ERROR'].filter(s => text.includes(s)),
    buttonLabels: buttons.map(b => (b.textContent || '').trim()).filter(Boolean),
  };
})()`);

console.log('\n=== DOM / GL STATE ===');
console.log(JSON.stringify(state, null, 2));

await shot('scene-overview');

if (ACTIONS) {
  // Click through every simulation state and screenshot the selected agent.
  const states = ['IDLE', 'THINKING', 'STREAMING', 'ERROR'];
  // The trigger buttons act on the *selected* robot, so remember which one that
  // is: the bubble afterwards must name it, not merely exist. The dock renders
  // the selection as "Only <name>" on its broadcast toggle, which is the only
  // stable, machine-readable place the selected agent's name appears.
  const triggeredAgent = await evaluate(`(() => {
    const toggle = [...document.querySelectorAll('button')]
      .find(b => /^Only /.test((b.textContent || '').trim()));
    return toggle ? toggle.textContent.trim().replace(/^Only /, '') : '';
  })()`);
  for (const state of states) {
    const clicked = await evaluate(`(() => {
      const btn = [...document.querySelectorAll('button')]
        .find(b => (b.getAttribute('aria-label') || '').includes('to ${state}'));
      if (!btn) return false;
      btn.click();
      return true;
    })()`);
    await delay(1400);
    console.log(`trigger ${state}: ${clicked ? 'clicked' : 'BUTTON NOT FOUND'}`);
    await shot(`state-${state.toLowerCase()}`);
  }

  // The loop above ends on ERROR, so the dismissible bubble must be on screen
  // now. Its presence is the only DOM-level proof that `lastError` reached the
  // canvas and that the bubble is actually rendered, not just stored.
  const after = await evaluate(`(() => {
    const t = document.body.innerText || '';
    const bubble = [...document.querySelectorAll('button')]
      .find(b => (b.getAttribute('aria-label') || '').startsWith('Dismiss error for'));
    return {
      bubbleVisible: !!bubble,
      bubbleLabel: bubble ? bubble.getAttribute('aria-label') : null,
      bubbleText: bubble ? bubble.parentElement.innerText.replace(/\\s+/g, ' ').trim() : null,
      pillText: t,
    };
  })()`);
  console.log('after-trigger check:', JSON.stringify(after));
  if (!after.bubbleVisible) {
    console.log('FAIL: no error bubble rendered after triggering ERROR');
    process.exitCode = 1;
  }
  // The bubble must belong to the agent the ERROR trigger targeted, not just
  // exist: `aria-label` is the only place the agent name is machine-readable.
  if (after.bubbleVisible && !after.bubbleLabel?.includes(triggeredAgent)) {
    console.log(
      `FAIL: bubble names "${after.bubbleLabel}", expected the triggered agent "${triggeredAgent}"`,
    );
    process.exitCode = 1;
  }
}

console.log('\n=== PAGE ERRORS ===');
console.log(pageErrors.length ? pageErrors.join('\n---\n') : '(none)');
console.log('\n=== CONSOLE ERRORS ===');
console.log(consoleErrors.length ? consoleErrors.join('\n---\n') : '(none)');
console.log('\n=== CONSOLE WARNINGS ===');
console.log(consoleWarnings.length ? consoleWarnings.join('\n---\n') : '(none)');
console.log('\n=== FAILED REQUESTS ===');
console.log(failedRequests.length ? failedRequests.join('\n') : '(none)');
console.log('\n=== ALL CONSOLE OUTPUT ===');
console.log(consoleAll.length ? consoleAll.join('\n') : '(none)');

ws.close();
