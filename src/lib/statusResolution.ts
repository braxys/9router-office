/**
 * Provider status rules for the 3D office.
 *
 * Kept free of Node imports and of any I/O so the truth table can be executed
 * directly by `scripts/status-rules.mjs` — the tests run this exact code, not a
 * copy of it.
 *
 * The inputs are two independent signals:
 *   - traffic   : when the provider last completed a request (`usageHistory`)
 *   - connection: what 9Router currently thinks of each account (`providerConnections`)
 *
 * Traffic is the stronger signal. 9Router writes a `usageHistory` row only after
 * a request succeeded, so a request one second old proves the provider is
 * serving right now — no per-account flag can contradict that. Connection flags
 * describe the accounts 9Router is *not* using, which is why they only decide the
 * label once the provider has gone quiet.
 */

import type { AgentStatus } from './types';

/** A request this recent means the provider is actively streaming. */
export const STREAMING_MS = 4_000;

/** A request this recent means the provider is still working on something. */
export const THINKING_MS = 25_000;

export interface ConnectionHealth {
  /** Connections that can receive traffic (not paused). */
  total: number;
  /** Connections flagged `unavailable`. */
  down: number;
  errorCodes: number[];
  /** The provider's own failure text for each down row, when it wrote one. */
  messages: string[];
  /**
   * Epoch ms of the earliest still-future reset instant across down rows, or
   * null when no row declares one.
   *
   * Built from `lastErrorAt + <duration in lastError>`. It is an absolute
   * instant on purpose: the provider writes "Resets in 167h57m31s" once, at
   * failure time, so reprinting a duration would be a frozen lie and
   * recomputing one every poll would make this value churn.
   *
   * "Earliest still in the future" is the provider's recovery time: the first
   * account to come back is when the provider can serve again. Taking the
   * latest instead would overstate the outage, and a row whose instant already
   * passed must not mask a later row that has not.
   */
  resetAt: number | null;
}

/** What 9Router stores inside `providerConnections.data`. */
export interface ConnectionFlag {
  testStatus?: string;
  errorCode?: number | string | null;
  lastError?: string | null;
  lastErrorAt?: string | null;
}

/** One `providerConnections` row, already JSON-parsed. */
export interface ConnectionRowLike {
  provider: string;
  /** 0/false means the account is paused and will never serve traffic. */
  isActive?: boolean | number | null;
  connection: ConnectionFlag | null;
}

export function emptyHealth(): ConnectionHealth {
  return { total: 0, down: 0, errorCodes: [], messages: [], resetAt: null };
}

function isPaused(isActive: boolean | number | null | undefined): boolean {
  return isActive === 0 || isActive === false;
}

/**
 * Group connection rows into per-provider health.
 *
 * Paused accounts are excluded entirely: 9Router only ever selects rows with
 * `isActive = 1`, so counting a paused-but-broken account would drag a healthy
 * provider down with an account that can never serve a request.
 *
 * There is deliberately no time-based expiry on the `unavailable` flag. The
 * obvious candidate — "ignore a flag older than N minutes" — was investigated
 * against the live database and rejected:
 *
 *   - `updatedAt` is NOT the time the flag was written. 9Router rewrites the row
 *     on token refresh and on usage-counter updates, so an account flagged
 *     `unavailable` at 01:50 can carry `updatedAt: 07:10` from a token refresh.
 *     Using it as the flag age would make a dead account look freshly dead.
 *   - `lastErrorAt` is the honest failure time, but an exhausted quota stays
 *     exhausted for days (the observed antigravity row reports "Resets in
 *     167h57m"). Expiring its flag would relabel a genuinely dead account as
 *     healthy.
 *   - `rateLimitedUntil`, the one field where 9Router declares its own expiry, is
 *     `null` on every row in the live database.
 *
 * So the flag is taken at face value until 9Router clears it, which it does on
 * its own backoff schedule when a retry finally succeeds.
 */
export function summariseConnections(
  rows: readonly ConnectionRowLike[],
  now: number = Date.now(),
): Map<string, ConnectionHealth> {
  const health = new Map<string, ConnectionHealth>();

  for (const row of rows) {
    if (isPaused(row.isActive)) continue;

    const entry = health.get(row.provider) ?? emptyHealth();
    entry.total += 1;

    if (row.connection?.testStatus === 'unavailable') {
      entry.down += 1;
      const code = Number(row.connection.errorCode);
      if (Number.isFinite(code) && code > 0) entry.errorCodes.push(code);

      const message = row.connection.lastError;
      if (typeof message === 'string' && message.trim() !== '') {
        entry.messages.push(message);
      }

      // The provider stamps its own reset duration into the failure text. Turn
      // it into an absolute instant so the label never goes stale.
      const resetMs = parseResetMs(message ?? '');
      const failedAt = Date.parse(row.connection.lastErrorAt ?? '');
      if (resetMs !== undefined && Number.isFinite(failedAt)) {
        const at = failedAt + resetMs;
        // The *earliest* instant still in the future is when the provider can
        // serve again, so that is the one worth printing. Taking the latest
        // would overstate the outage; and a row whose instant already passed
        // must not mask a later row that has not, which is why this compares
        // against `now` rather than just taking the minimum of all candidates.
        if (at > now && (entry.resetAt === null || at < entry.resetAt)) {
          entry.resetAt = at;
        }
      }
    }

    health.set(row.provider, entry);
  }

  return health;
}

/**
 * Priority:
 *   1. no traffic in the window                  -> IDLE
 *   2. a request finished moments ago            -> STREAMING
 *   3. a request inside the thinking window      -> THINKING
 *   4. every usable connection is unavailable    -> ERROR
 *   5. otherwise                                 -> IDLE
 *
 * Steps 2-3 come before step 4 on purpose. Flags used to win, which made a provider
 * with 2/3 healthy accounts look degraded even while it was mid-stream, so its
 * robot stopped typing. Traffic is proof of work; a flag is a statement about
 * capacity. Proof wins while it is fresh.
 *
 * There is no fifth "degraded" status. A provider with some accounts down but at
 * least one still usable keeps reporting what it is doing, and shows nothing at
 * all — no status change and no bubble. Only `isExhausted` earns `ERROR`.
 */

/**
 * True when a provider has nothing left to serve.
 *
 * This single predicate is the user's invariant: `ERROR` *and* the error bubble
 * are both gated on it, so they can never disagree about whether a provider is
 * dead. `routerAdapter`, `resolveStatus` and `scripts/explain-status.mjs` all
 * call it rather than re-deriving `down === total` — an earlier copy-paste
 * meant the pill and the bubble were two independent expressions of one rule.
 */
export function isExhausted(health: ConnectionHealth): boolean {
  return health.total > 0 && health.down === health.total;
}

export function resolveStatus(
  msSinceLast: number,
  health: ConnectionHealth,
  hasTraffic: boolean,
): AgentStatus {
  if (!hasTraffic) return 'IDLE';
  if (msSinceLast < STREAMING_MS) return 'STREAMING';
  if (msSinceLast < THINKING_MS) return 'THINKING';
  if (isExhausted(health)) return 'ERROR';
  return 'IDLE';
}

/* -------------------------------------------------------------------------- */
/*  Error description                                                         */
/* -------------------------------------------------------------------------- */

/** What kind of failure an account is in, from most to least permanent. */
export type ErrorCause = 'auth' | 'quota' | 'rate-limit' | 'unknown';

/** Cause ranking: the most permanent cause is the one a human must act on. */
const CAUSE_RANK: Record<ErrorCause, number> = {
  auth: 0,
  quota: 1,
  'rate-limit': 2,
  unknown: 3,
};

const CAUSE_LABEL: Record<ErrorCause, string> = {
  auth: 'Sign-in failed',
  quota: 'Quota exhausted',
  'rate-limit': 'Rate limited',
  unknown: 'Upstream unavailable',
};

/**
 * Classify one account failure.
 *
 * The provider's message is checked before the HTTP code because the same code
 * means different things across providers: CodeBuddy reports an exhausted
 * balance as `429` with "Credits exhausted", which is a quota problem, not a
 * throttling one.
 */
export function classifyProviderError(
  message: string | undefined,
  code: number | undefined,
): ErrorCause {
  const text = (message ?? '').toLowerCase();
  if (text) {
    if (text.includes('quota') || text.includes('credits exhausted')) return 'quota';
    if (text.includes('rate limit') || text.includes('too many requests')) return 'rate-limit';
    if (
      text.includes('unauthor') ||
      text.includes('forbidden') ||
      text.includes('invalid token')
    ) {
      return 'auth';
    }
  }

  if (code === 401 || code === 403) return 'auth';
  if (code === 429) return 'rate-limit';
  return 'unknown';
}

/**
 * Pull the provider's own reset duration out of its failure text.
 *
 * Accepts `167h57m31s`, `45m`, `2d 3h` — the formats 9Router's upstreams use —
 * and returns milliseconds, or undefined when the text carries no duration.
 */
export function parseResetMs(message: string): number | undefined {
  const match = /resets?\s+in\s+(.+)$/i.exec(message);
  if (!match) return undefined;

  const body = match[1];
  let total = 0;
  let found = false;
  for (const [, value, unit] of body.matchAll(/(\d+)\s*([dhms])/gi)) {
    found = true;
    const n = Number(value);
    if (unit === 'd') total += n * 86_400_000;
    else if (unit === 'h') total += n * 3_600_000;
    else if (unit === 'm') total += n * 60_000;
    else total += n * 1_000;
  }
  return found ? total : undefined;
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * One short line describing what is wrong with a provider, or undefined when
 * nothing is.
 *
 * Format: `<cause> · <codes> · resets <date> · <down>/<total> down`, with the
 * optional parts omitted when the data does not support them. The date is
 * formatted from a fixed English month table in UTC — this string is built on
 * the server, so it must not depend on the server's locale.
 */
export function describeError(health: ConnectionHealth, now: number): string | undefined {
  if (health.down === 0) return undefined;

  let cause: ErrorCause = 'unknown';
  if (health.messages.length > 0) {
    for (const message of health.messages) {
      const next = classifyProviderError(message, undefined);
      if (CAUSE_RANK[next] < CAUSE_RANK[cause]) cause = next;
    }
  } else {
    for (const code of health.errorCodes) {
      const next = classifyProviderError(undefined, code);
      if (CAUSE_RANK[next] < CAUSE_RANK[cause]) cause = next;
    }
  }

  const parts = [CAUSE_LABEL[cause]];

  const codes = [...new Set(health.errorCodes)].sort((a, b) => a - b);
  if (codes.length > 0) parts.push(codes.join('/'));

  if (health.resetAt !== null && health.resetAt > now) {
    const date = new Date(health.resetAt);
    parts.push(`resets ${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`);
  }

  parts.push(`${health.down}/${health.total} down`);
  return parts.join(' · ');
}
