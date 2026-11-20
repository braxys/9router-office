/**
 * Explain the live status of every provider in the 3D office.
 *
 * Runs the SHIPPING rules from `src/lib/statusResolution.ts` against the live
 * 9Router database (read-only), so an `ERROR` label can be traced to the exact
 * connection rows that caused it, and a bubble's text can be reproduced.
 *
 *   npm run status:live
 */
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import os from 'node:os';
import {
  STREAMING_MS,
  describeError,
  emptyHealth,
  isExhausted,
  resolveStatus,
  summariseConnections,
} from '../src/lib/statusResolution.ts';

const dbPath =
  process.env.NINEROUTER_DB_PATH ??
  path.join(
    process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'),
    '9router',
    'db',
    'data.sqlite',
  );

let db;
try {
  db = new DatabaseSync(dbPath, { readOnly: true });
} catch (error) {
  console.error(`cannot open ${dbPath}`);
  console.error(error.message);
  process.exit(1);
}

const now = Date.now();

const rows = db
  .prepare(`SELECT provider, name, isActive, data FROM providerConnections`)
  .all()
  .map((r) => {
    let connection = null;
    try {
      connection = r.data ? JSON.parse(r.data) : null;
    } catch {
      connection = null;
    }
    return { provider: r.provider, name: r.name, isActive: r.isActive, connection };
  });

const health = summariseConnections(rows, now);

const stats = new Map();
for (const r of db
  .prepare(
    `SELECT provider, MAX(timestamp) AS last, COUNT(*) AS n
       FROM usageHistory GROUP BY provider`,
  )
  .all()) {
  stats.set(r.provider, { last: r.last, n: r.n });
}

// Completions inside the streaming window: `resolveStatus` needs this to tell a
// stream that is still running from one that just finished.
const streamingCutoff = new Date(now - STREAMING_MS).toISOString();
const bursts = new Map();
for (const r of db
  .prepare(
    `SELECT provider, COUNT(*) AS n
       FROM usageHistory WHERE timestamp >= ? GROUP BY provider`,
  )
  .all(streamingCutoff)) {
  bursts.set(r.provider, r.n);
}

const nonOk = new Map();
for (const r of db
  .prepare(`SELECT provider, COUNT(*) AS n FROM usageHistory WHERE status <> 'ok' GROUP BY provider`)
  .all()) {
  nonOk.set(r.provider, r.n);
}

console.log(`db  : ${dbPath}`);
console.log(`now : ${new Date(now).toISOString()}`);
console.log('rule: fresh traffic wins; connection flags decide only once the provider is quiet');
console.log('      STREAMING needs >= 2 completions inside the window (a finished request is not a live one)');
console.log('      paused accounts (isActive = 0) are excluded from the counts');
console.log('      ERROR (and the bubble) only when every usable account is down\n');

for (const p of [...health.keys()].sort()) {
  const h = health.get(p) ?? emptyHealth();
  const stat = stats.get(p);
  const lastAt = stat?.last ? Date.parse(stat.last) : 0;
  const msSince = lastAt > 0 ? now - lastAt : Number.POSITIVE_INFINITY;
  const recent = bursts.get(p) ?? 0;
  const status = resolveStatus(msSince, h, (stat?.n ?? 0) > 0, recent);
  const exhausted = isExhausted(h);
  // The app only builds a bubble for an exhausted provider, so mirror that
  // gate here — printing a message for a partial outage would not match what
  // the office actually shows.
  const err = exhausted ? describeError(h, now) : undefined;
  const age = Number.isFinite(msSince) ? `${Math.round(msSince / 1000)}s ago` : 'never';

  console.log(
    `${p.padEnd(16)} ${status.padEnd(9)} usable=${h.total} down=${h.down}` +
      `  last request ${age}` +
      `  completions<${STREAMING_MS / 1000}s: ${recent}` +
      `  non-ok rows: ${nonOk.get(p) ?? 0}` +
      `${err ? `  | ${err}` : ''}`,
  );

  if (h.down === 0) continue;
  for (const r of rows) {
    if (r.provider !== p || r.connection?.testStatus !== 'unavailable') continue;
    const paused = r.isActive === 0 || r.isActive === false;
    console.log(
      `    ${String(r.name ?? '').padEnd(24)} ${paused ? 'IGNORED (paused)' : 'COUNTED (down)'}` +
        `  code=${r.connection?.errorCode ?? '-'}` +
        `${exhausted ? '' : '  (partial: still serving, no bubble)'}`,
    );
  }
}

db.close();
