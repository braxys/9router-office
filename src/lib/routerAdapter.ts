/**
 * 9Router telemetry adapter.
 *
 * Reads the local 9Router SQLite database directly (read-only) and normalises
 * it into `AgentTelemetry` rows the 3D office can render.
 *
 * Why SQLite and not the dashboard API: 9Router's `/api/usage/*` routes are
 * cookie/JWT protected (they return 401 without a dashboard session), while the
 * database is plain `sqlite` on disk and already runs in WAL mode. Reading it
 * costs one prepared query per poll and needs no credentials.
 *
 * Database location (first match wins):
 *   NINEROUTER_DB_PATH env var
 *   %APPDATA%/9router/db/data.sqlite            (Windows)
 *   ~/Library/Application Support/9router/db/…  (macOS)
 *   ~/.config/9router/db/data.sqlite            (Linux)
 *
 * Tables used:
 *   usageHistory        id, timestamp, provider, model, promptTokens,
 *                       completionTokens, cost, status, tokens, meta
 *   usageDaily          dateKey, data (JSON: requests, promptTokens,
 *                       completionTokens, cost, byProvider, byModel)
 *   providerConnections provider, isActive, data (JSON: testStatus,
 *                       errorCode, backoffLevel, lastUsedAt, …)
 */

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import type { AgentTelemetry } from './types';
import { resolveIdentity } from './providerIdentity';
import {
  describeError,
  emptyHealth,
  isExhausted,
  resolveStatus,
  summariseConnections,
  type ConnectionFlag,
  type ConnectionRowLike,
} from './statusResolution';

/* -------------------------------------------------------------------------- */
/*  Tuning                                                                    */
/* -------------------------------------------------------------------------- */

/** How many desks the office can seat. Scene has this many slots. */
const MAX_AGENTS = 4;

/** Window used to estimate tokens/second and inter-request latency. */
const RATE_WINDOW_MS = 30_000;

/** Snapshot cache — survives a burst of concurrent polls. */
const CACHE_MS = 800;

const DAY_MS = 24 * 60 * 60 * 1000;

/* -------------------------------------------------------------------------- */
/*  Provider presentation                                                     */
/* -------------------------------------------------------------------------- */

// Names, colours and bot identities all come from `providerIdentity.ts`. This
// adapter used to keep its own `PROVIDER_META` table and hash palette, which
// meant a provider's mug, monitor LED and selection ring could disagree with the
// colour of its own body. One resolver now answers all of it.

/* -------------------------------------------------------------------------- */
/*  Public shape                                                              */
/* -------------------------------------------------------------------------- */

export interface TelemetrySnapshot {
  /** Normalised agents, at most `MAX_AGENTS`, ordered by 24h traffic. */
  agents: AgentTelemetry[];
  /** Requests counted in the ranking window. */
  windowRequests: number;
  /** Epoch ms the snapshot was assembled. */
  readAt: number;
  /** Absolute path of the database that was read. */
  dbPath: string;
}

/* -------------------------------------------------------------------------- */
/*  Database handle                                                           */
/* -------------------------------------------------------------------------- */

interface SqliteStatement {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
}

interface SqliteDatabase {
  prepare(sql: string): SqliteStatement;
  close(): void;
}

export function resolveDbPath(): string {
  const override = process.env.NINEROUTER_DB_PATH;
  if (override) return override;

  const candidates: string[] = [];
  const appData = process.env.APPDATA;
  if (appData) candidates.push(path.join(appData, '9router', 'db', 'data.sqlite'));

  const home = homedir();
  candidates.push(
    path.join(home, 'Library', 'Application Support', '9router', 'db', 'data.sqlite'),
    path.join(home, '.config', '9router', 'db', 'data.sqlite'),
  );

  const found = candidates.find((candidate) => existsSync(candidate));
  return found ?? candidates[0];
}

/**
 * `process.getBuiltinModule` (Node 22.3+) reaches `node:sqlite` without going
 * through the bundler, so webpack never tries to resolve an experimental
 * builtin. Returns null on runtimes that do not ship it.
 */
function openDatabase(dbPath: string): SqliteDatabase {
  const getBuiltin = (process as unknown as {
    getBuiltinModule?: (id: string) => unknown;
  }).getBuiltinModule;

  if (typeof getBuiltin !== 'function') {
    throw new Error('process.getBuiltinModule is unavailable — Node 22.3+ required');
  }

  const sqlite = getBuiltin('node:sqlite') as
    | { DatabaseSync: new (path: string, options?: { readOnly?: boolean }) => SqliteDatabase }
    | undefined;

  if (!sqlite?.DatabaseSync) {
    throw new Error('node:sqlite is unavailable on this runtime');
  }

  return new sqlite.DatabaseSync(dbPath, { readOnly: true });
}

/* -------------------------------------------------------------------------- */
/*  Query helpers                                                             */
/* -------------------------------------------------------------------------- */

interface ActivityRow {
  provider: string;
  requests: number;
  lastAt: string;
}

interface RecentRow {
  provider: string;
  timestamp: string;
  completionTokens: number | null;
}

interface ConnectionRow {
  provider: string;
  isActive: number | boolean | null;
  data: string | null;
}

interface DailyRow {
  data: string | null;
}

interface ProviderStats {
  requests: number;
  promptTokens: number;
  completionTokens: number;
  cost: number;
}

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function toNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function toMs(iso: string | null | undefined): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/* -------------------------------------------------------------------------- */
/*  Snapshot builder                                                          */
/* -------------------------------------------------------------------------- */

let cached: { at: number; snapshot: TelemetrySnapshot } | null = null;
let db: SqliteDatabase | null = null;
let dbPathInUse = '';

function ensureDb(): SqliteDatabase {
  const nextPath = resolveDbPath();
  if (db && dbPathInUse === nextPath) return db;
  if (db) {
    try {
      db.close();
    } catch {
      /* already gone */
    }
  }
  db = openDatabase(nextPath);
  dbPathInUse = nextPath;
  return db;
}

function closeDb(): void {
  if (!db) return;
  try {
    db.close();
  } catch {
    /* ignore */
  }
  db = null;
  dbPathInUse = '';
}

/**
 * Read the database and normalise it. Throws when the database is missing or
 * unreadable, which the API route turns into `connected: false` so the client
 * can fall back to Simulation Mode.
 */
export async function readTelemetrySnapshot(): Promise<TelemetrySnapshot> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_MS) {
    return cached.snapshot;
  }

  const path = resolveDbPath();
  if (!existsSync(path)) {
    throw new Error(`9Router database not found at ${path}`);
  }

  const handle = ensureDb();

  try {
    const cutoff24h = new Date(now - DAY_MS).toISOString();

    // 1. Rank providers by traffic in the last 24h.
    let activity = handle
      .prepare(
        `SELECT provider, COUNT(*) AS requests, MAX(timestamp) AS lastAt
           FROM usageHistory
          WHERE timestamp >= ?
          GROUP BY provider
          ORDER BY requests DESC, lastAt DESC
          LIMIT ?`,
      )
      .all(cutoff24h, MAX_AGENTS) as ActivityRow[];

    // Quiet install: fall back to all-time ranking so the office is not empty.
    if (activity.length === 0) {
      activity = handle
        .prepare(
          `SELECT provider, COUNT(*) AS requests, MAX(timestamp) AS lastAt
             FROM usageHistory
            GROUP BY provider
            ORDER BY requests DESC, lastAt DESC
            LIMIT ?`,
        )
        .all(MAX_AGENTS) as ActivityRow[];
    }

    if (activity.length === 0) {
      const snapshot: TelemetrySnapshot = {
        agents: [],
        windowRequests: 0,
        readAt: now,
        dbPath: path,
      };
      cached = { at: now, snapshot };
      return snapshot;
    }

    const selected = new Set(activity.map((row) => row.provider));

    // 2. Recent rows drive tokens/second and inter-request latency.
    const recent = handle
      .prepare(
        `SELECT provider, timestamp, completionTokens
           FROM usageHistory
          WHERE timestamp >= ?
          ORDER BY id DESC
          LIMIT 400`,
      )
      .all(new Date(now - RATE_WINDOW_MS).toISOString()) as RecentRow[];

    // 3. Today's totals come from the pre-aggregated daily rollup.
    const daily = handle
      .prepare(`SELECT data FROM usageDaily WHERE dateKey = ?`)
      .get(new Date(now).toISOString().slice(0, 10)) as DailyRow | undefined;
    const dailyData = safeParse<{ byProvider?: Record<string, ProviderStats> }>(
      daily?.data ?? null,
    );
    const byProvider = dailyData?.byProvider ?? {};

    // 4. Connection health flags degraded or dead providers. The rule lives in
    // `statusResolution.ts` so the truth table can be tested against this exact
    // code instead of a copy.
    const connections = handle
      .prepare(`SELECT provider, isActive, data FROM providerConnections`)
      .all() as ConnectionRow[];

    const health = summariseConnections(
      connections.map(
        (row): ConnectionRowLike => ({
          provider: row.provider,
          isActive: row.isActive,
          connection: safeParse<ConnectionFlag>(row.data),
        }),
      ),
      now,
    );

    const rates = new Map<string, { tokens: number; timestamps: number[] }>();
    for (const row of recent) {
      if (!selected.has(row.provider)) continue;
      const entry = rates.get(row.provider) ?? { tokens: 0, timestamps: [] };
      entry.tokens += toNumber(row.completionTokens);
      entry.timestamps.push(toMs(row.timestamp));
      rates.set(row.provider, entry);
    }

    const agents: AgentTelemetry[] = activity.map((row) => {
      const providerHealth = health.get(row.provider) ?? emptyHealth();
      const rate = rates.get(row.provider);
      const lastAt = toMs(row.lastAt);
      const msSinceLast = lastAt > 0 ? Math.max(0, now - lastAt) : Number.POSITIVE_INFINITY;

      const status = resolveStatus(msSinceLast, providerHealth, row.requests > 0);

      // The bubble is reserved for a provider that has nothing left to serve.
      // A partial outage (some accounts down, at least one still usable) is
      // deliberately silent: the office reports what the provider is doing, not
      // how much spare capacity it has lost. Same predicate as `ERROR`, so the
      // pill and the bubble cannot disagree.
      const exhausted = isExhausted(providerHealth);

      // Tokens/second over the rate window.
      const tokensPerSecond = rate
        ? Math.round((rate.tokens / (RATE_WINDOW_MS / 1000)) * 10) / 10
        : 0;

      // No latency column exists. The median gap between the last few completed
      // requests is the closest honest measure of how long a turn takes.
      const sortedStamps = rate ? [...rate.timestamps].sort((a, b) => a - b) : [];
      const gaps: number[] = [];
      for (let i = 1; i < sortedStamps.length; i += 1) {
        const gap = sortedStamps[i] - sortedStamps[i - 1];
        if (gap > 0) gaps.push(gap);
      }
      const latencyMs = Math.round(median(gaps));

      const today = byProvider[row.provider];
      const totalTokensToday = today
        ? toNumber(today.promptTokens) + toNumber(today.completionTokens)
        : 0;

      const identity = resolveIdentity(row.provider);

      return {
        id: row.provider,
        name: identity.label,
        provider: row.provider,
        accentColor: identity.color,
        identity: identity.id,
        status,
        tokensPerSecond,
        totalTokensToday,
        latencyMs,
        lastError: exhausted ? describeError(providerHealth, now) : undefined,
        updatedAt: now,
      };
    });

    const snapshot: TelemetrySnapshot = {
      agents,
      windowRequests: activity.reduce((sum, row) => sum + toNumber(row.requests), 0),
      readAt: now,
      dbPath: path,
    };

    cached = { at: now, snapshot };
    return snapshot;
  } catch (error) {
    // A stale handle breaks every later call; drop it so the next poll retries.
    closeDb();
    throw error;
  }
}
