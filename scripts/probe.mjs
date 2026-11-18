// Ad-hoc CDP probe: evaluate an expression in the already-open page.
// Usage: node scripts/probe.mjs "<js expression>"
import { setTimeout as delay } from 'node:timers/promises';

const PORT = Number(process.env.CDP_PORT ?? 9223);
const expression = process.argv[2] ?? 'document.title';

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const target = list.find((t) => t.type === 'page');
if (!target) throw new Error('no page target');

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

const res = await send('Runtime.evaluate', {
  expression,
  returnByValue: true,
  awaitPromise: true,
});
console.log(
  res.exceptionDetails
    ? `ERROR: ${res.exceptionDetails.exception?.description ?? res.exceptionDetails.text}`
    : JSON.stringify(res.result.value, null, 2),
);

await delay(50);
ws.close();
