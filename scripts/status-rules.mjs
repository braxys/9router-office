/**
 * Truth table for the provider status rules.
 *
 * Imports `src/lib/statusResolution.ts` directly (Node 24 strips types), so this
 * exercises the shipping code rather than a re-implementation.
 *
 *   npm run status:test
 */
import {
  STREAMING_MS,
  THINKING_MS,
  classifyProviderError,
  describeError,
  emptyHealth,
  parseResetMs,
  resolveStatus,
  summariseConnections,
} from '../src/lib/statusResolution.ts';

let failures = 0;
let total = 0;

function check(label, actual, expected) {
  total += 1;
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) failures += 1;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`);
  if (!pass) {
    console.log(`      expected: ${JSON.stringify(expected)}`);
    console.log(`      actual  : ${JSON.stringify(actual)}`);
  }
}

const health = (over = {}) => ({ ...emptyHealth(), ...over });

/* -------------------------------------------------------------------------- */
console.log('\n--- resolveStatus: traffic outranks account flags ---\n');

check(
  'healthy provider, request 1s ago -> STREAMING',
  resolveStatus(1_000, health({ total: 3 }), true),
  'STREAMING',
);
check(
  'healthy provider, request 10s ago -> THINKING',
  resolveStatus(10_000, health({ total: 3 }), true),
  'THINKING',
);
check(
  'healthy provider, quiet -> IDLE',
  resolveStatus(600_000, health({ total: 3 }), true),
  'IDLE',
);

// The regression that started this: 2/3 accounts healthy and a request 1s old.
check(
  '1/3 down + request 1s ago -> STREAMING (traffic outranks the flag)',
  resolveStatus(1_000, health({ total: 3, down: 1 }), true),
  'STREAMING',
);
check(
  '1/3 down + request 10s ago -> THINKING (traffic outranks the flag)',
  resolveStatus(10_000, health({ total: 3, down: 1 }), true),
  'THINKING',
);
check(
  '1/3 down + quiet -> IDLE (still serving, so not ERROR)',
  resolveStatus(600_000, health({ total: 3, down: 1 }), true),
  'IDLE',
);
check(
  '2/3 down + quiet -> IDLE (one account left is still capacity)',
  resolveStatus(600_000, health({ total: 3, down: 2 }), true),
  'IDLE',
);
check(
  '3/3 down + quiet -> ERROR (nothing left to serve)',
  resolveStatus(600_000, health({ total: 3, down: 3 }), true),
  'ERROR',
);
check(
  '3/3 down + request 1s ago -> STREAMING (traffic is proof)',
  resolveStatus(1_000, health({ total: 3, down: 3 }), true),
  'STREAMING',
);
check(
  '3/3 down + quiet -> ERROR',
  resolveStatus(600_000, health({ total: 3, down: 3 }), true),
  'ERROR',
);
check(
  'no traffic at all -> IDLE even with flags',
  resolveStatus(Number.POSITIVE_INFINITY, health({ total: 3, down: 1 }), false),
  'IDLE',
);
check(
  'paused-only provider (total 0) never reports ERROR',
  resolveStatus(600_000, health({ total: 0, down: 0 }), true),
  'IDLE',
);

/* -------------------------------------------------------------------------- */
console.log('\n--- summariseConnections: paused rows are ignored ---\n');

const row = (over = {}) => ({
  provider: 'codebuddy-intl',
  isActive: 1,
  connection: { testStatus: 'active' },
  ...over,
});

const downRow = (over = {}) =>
  row({ connection: { testStatus: 'unavailable', errorCode: 429 }, ...over });

const s = (rows) => Object.fromEntries(summariseConnections(rows));

check(
  'three active, one down -> total 3, down 1',
  s([row(), row(), downRow()])['codebuddy-intl'],
  { total: 3, down: 1, errorCodes: [429], messages: [], resetAt: null },
);
check(
  'paused down account is not counted at all',
  s([row(), row(), downRow({ isActive: 0 })])['codebuddy-intl'],
  { total: 2, down: 0, errorCodes: [], messages: [], resetAt: null },
);
check(
  'paused account is excluded from total too',
  s([row(), row({ isActive: false })])['codebuddy-intl'],
  { total: 1, down: 0, errorCodes: [], messages: [], resetAt: null },
);
check(
  'an exhausted account stays down however old the flag is (quota resets take days)',
  s([row(), downRow()])['codebuddy-intl'],
  { total: 2, down: 1, errorCodes: [429], messages: [], resetAt: null },
);
check(
  'row with unparsable data still counts toward total',
  s([row({ connection: null }), downRow()])['codebuddy-intl'],
  { total: 2, down: 1, errorCodes: [429], messages: [], resetAt: null },
);
check(
  'duplicate error codes are deduped by describeError, not here',
  s([downRow(), downRow(), downRow()])['codebuddy-intl'],
  { total: 3, down: 3, errorCodes: [429, 429, 429], messages: [], resetAt: null },
);
check(
  'provider with no rows -> absent from the map',
  s([])['codebuddy-intl'],
  undefined,
);
check(
  'two providers stay separate',
  s([
    row(),
    downRow({ provider: 'antigravity' }),
  ]),
  {
    'codebuddy-intl': { total: 1, down: 0, errorCodes: [], messages: [], resetAt: null },
    antigravity: { total: 1, down: 1, errorCodes: [429], messages: [], resetAt: null },
  },
);

// The provider's own failure text and its reset instant must survive the fold.
const failedAt = '2026-11-18T01:50:50.541Z';
const withMessage = summariseConnections([
  {
    provider: 'antigravity',
    isActive: 1,
    connection: {
      testStatus: 'unavailable',
      errorCode: 429,
      lastError: '[429]: Individual quota reached. Resets in 167h57m31s.',
      lastErrorAt: failedAt,
    },
  },
]).get('antigravity');

check(
  'failure text is collected',
  withMessage.messages,
  ['[429]: Individual quota reached. Resets in 167h57m31s.'],
);
check(
  'reset instant is lastErrorAt + the parsed duration',
  withMessage.resetAt,
  Date.parse(failedAt) + (167 * 3600 + 57 * 60 + 31) * 1000,
);
check(
  'no reset text leaves resetAt null',
  summariseConnections([
    {
      provider: 'codebuddy-intl',
      isActive: 1,
      connection: { testStatus: 'unavailable', errorCode: 429, lastError: 'Credits exhausted' },
    },
  ]).get('codebuddy-intl').resetAt,
  null,
);

// Two dead accounts, different durations: the provider recovers when the
// *first* one comes back, so the earliest future instant wins.
const twoDurations = summariseConnections(
  [
    {
      provider: 'antigravity',
      isActive: 1,
      connection: {
        testStatus: 'unavailable',
        errorCode: 429,
        lastError: 'Resets in 10h',
        lastErrorAt: '2026-11-18T00:00:00.000Z',
      },
    },
    {
      provider: 'antigravity',
      isActive: 1,
      connection: {
        testStatus: 'unavailable',
        errorCode: 429,
        lastError: 'Resets in 2h',
        lastErrorAt: '2026-11-18T00:00:00.000Z',
      },
    },
  ],
  Date.parse('2026-11-18T00:00:00.000Z'),
).get('antigravity');
check(
  'two down rows: earliest future reset wins, not the latest',
  twoDurations.resetAt,
  Date.parse('2026-11-18T02:00:00.000Z'),
);

// A row whose instant already passed must not mask a later row that has not.
const pastAndFuture = summariseConnections(
  [
    {
      provider: 'antigravity',
      isActive: 1,
      connection: {
        testStatus: 'unavailable',
        errorCode: 429,
        lastError: 'Resets in 1h',
        lastErrorAt: '2026-11-18T00:00:00.000Z',
      },
    },
    {
      provider: 'antigravity',
      isActive: 1,
      connection: {
        testStatus: 'unavailable',
        errorCode: 500,
        lastError: 'Resets in 10h',
        lastErrorAt: '2026-11-18T00:00:00.000Z',
      },
    },
  ],
  Date.parse('2026-11-18T05:00:00.000Z'),
).get('antigravity');
check(
  'a past reset instant is skipped, the future one survives',
  pastAndFuture.resetAt,
  Date.parse('2026-11-18T10:00:00.000Z'),
);
check(
  'paused down account is excluded from the map entirely',
  summariseConnections([
    {
      provider: 'antigravity',
      isActive: 0,
      connection: {
        testStatus: 'unavailable',
        errorCode: 429,
        lastError: 'Resets in 10h',
        lastErrorAt: failedAt,
      },
    },
  ]).get('antigravity'),
  undefined,
);

/* -------------------------------------------------------------------------- */
console.log('\n--- classifyProviderError ---\n');

check(
  'credits exhausted -> quota',
  classifyProviderError('Credits exhausted. Please purchase add-on packs', 429),
  'quota',
);
check(
  'quota reached -> quota',
  classifyProviderError('Individual quota reached. Please upgrade', 429),
  'quota',
);
check(
  'rate limit text -> rate-limit',
  classifyProviderError('Rate limit exceeded, too many requests', 429),
  'rate-limit',
);
check(
  'unauthorized text -> auth',
  classifyProviderError('Unauthorized: invalid token', 401),
  'auth',
);
check('no message, code 401 -> auth', classifyProviderError(undefined, 401), 'auth');
check('no message, code 403 -> auth', classifyProviderError(undefined, 403), 'auth');
check('no message, code 429 -> rate-limit', classifyProviderError(undefined, 429), 'rate-limit');
check('no message, code 500 -> unknown', classifyProviderError(undefined, 500), 'unknown');
check('nothing at all -> unknown', classifyProviderError(undefined, undefined), 'unknown');

/* -------------------------------------------------------------------------- */
console.log('\n--- parseResetMs ---\n');

check(
  '167h57m31s',
  parseResetMs('Resets in 167h57m31s'),
  (167 * 3600 + 57 * 60 + 31) * 1000,
);
check('45m only', parseResetMs('resets in 45m'), 45 * 60 * 1000);
check('2d 3h', parseResetMs('resets in 2d 3h'), (2 * 24 + 3) * 3600 * 1000);
check('no reset text -> undefined', parseResetMs('Credits exhausted'), undefined);

/* -------------------------------------------------------------------------- */
console.log('\n--- describeError ---\n');

const NOW = Date.parse('2026-11-18T08:00:00.000Z');

check('healthy -> undefined', describeError(health({ total: 3 }), NOW), undefined);
check(
  'quota with a future reset -> cause, code, date, fraction',
  describeError(
    health({
      total: 5,
      down: 1,
      errorCodes: [429],
      messages: ['[429]: Individual quota reached. Resets in 167h57m31s.'],
      resetAt: Date.parse('2026-11-25T01:48:21.541Z'),
    }),
    NOW,
  ),
  'Quota exhausted · 429 · resets Nov 25 · 1/5 down',
);
check(
  'reset date in the past is dropped',
  describeError(
    health({ total: 5, down: 1, errorCodes: [429], messages: ['Credits exhausted'], resetAt: NOW - 1000 }),
    NOW,
  ),
  'Quota exhausted · 429 · 1/5 down',
);
check(
  'auth outranks quota when causes are mixed',
  describeError(
    health({
      total: 3,
      down: 2,
      errorCodes: [429, 401],
      messages: ['Credits exhausted', 'Unauthorized: invalid token'],
    }),
    NOW,
  ),
  'Sign-in failed · 401/429 · 2/3 down',
);
check(
  'no message but a 429 code -> rate limited',
  describeError(health({ total: 2, down: 1, errorCodes: [429] }), NOW),
  'Rate limited · 429 · 1/2 down',
);
check(
  'no code and no message -> upstream unavailable',
  describeError(health({ total: 2, down: 1 }), NOW),
  'Upstream unavailable · 1/2 down',
);
check(
  'repeated codes are collapsed and sorted',
  describeError(health({ total: 3, down: 3, errorCodes: [429, 429, 401] }), NOW),
  'Sign-in failed · 401/429 · 3/3 down',
);

/* -------------------------------------------------------------------------- */
console.log('\n--- end-to-end: the reported bug ---\n');

const liveRows = [
  { provider: 'codebuddy-intl', isActive: 1, connection: { testStatus: 'unavailable', errorCode: 429 } },
  { provider: 'codebuddy-intl', isActive: 1, connection: { testStatus: 'active' } },
  { provider: 'codebuddy-intl', isActive: 1, connection: { testStatus: 'active' } },
];
const liveHealth = summariseConnections(liveRows).get('codebuddy-intl');

check(
  'idle + 1/3 down -> IDLE (still serving, so not ERROR)',
  resolveStatus(600_000, liveHealth, true),
  'IDLE',
);
check(
  'streaming + 1/3 down -> STREAMING (the fix)',
  resolveStatus(1_500, liveHealth, true),
  'STREAMING',
);
check(
  'thinking + 1/3 down -> THINKING (the fix)',
  resolveStatus(12_000, liveHealth, true),
  'THINKING',
);
check(
  'error message still names the fraction',
  describeError(liveHealth, NOW),
  'Rate limited · 429 · 1/3 down',
);

// The case the user reported: every account for one provider is exhausted.
const exhaustedHealth = summariseConnections([
  {
    provider: 'codebuddy-intl',
    isActive: 1,
    connection: { testStatus: 'unavailable', errorCode: 429, lastError: 'Credits exhausted' },
  },
  {
    provider: 'codebuddy-intl',
    isActive: 1,
    connection: { testStatus: 'unavailable', errorCode: 429, lastError: 'Credits exhausted' },
  },
  {
    provider: 'codebuddy-intl',
    isActive: 1,
    connection: { testStatus: 'unavailable', errorCode: 429, lastError: 'Credits exhausted' },
  },
]).get('codebuddy-intl');

check(
  'all three accounts exhausted -> ERROR',
  resolveStatus(600_000, exhaustedHealth, true),
  'ERROR',
);
check(
  'all three exhausted still streams while traffic is fresh',
  resolveStatus(1_500, exhaustedHealth, true),
  'STREAMING',
);
check(
  'exhausted provider describes itself for the bubble',
  describeError(exhaustedHealth, NOW),
  'Quota exhausted · 429 · 3/3 down',
);

/* -------------------------------------------------------------------------- */
console.log(`\n${total - failures}/${total} passed`);
console.log(`tuning: STREAMING_MS=${STREAMING_MS} THINKING_MS=${THINKING_MS}`);
if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('all status rules behave as specified');
