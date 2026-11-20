/**
 * Truth table for the transport (pause) rules and for live-status decay.
 *
 * Imports the shipping modules directly (Node 24 strips types), so this
 * exercises real code rather than a re-implementation.
 *
 * Two regressions this locks down:
 *
 *   1. "Pause" used to be a source switch, not a brake. `simulationMode` picked
 *      between live telemetry and the mock tick, so pressing Pause handed the
 *      robots to the live feed and they kept moving. `paused` is now a separate
 *      latch that stops BOTH sources, and no mode change may clear it.
 *
 *   2. A live STREAMING label used to latch. `tick()` never changed a status and
 *      a failed poll forced `simulationMode` back on, so a provider whose
 *      session had ended kept its STREAMING label forever. Live labels now decay
 *      against the snapshot time, and STREAMING additionally requires proof of
 *      an ongoing stream (two completions inside the window), because
 *      `usageHistory` is only written when a request FINISHES.
 *
 *   npm run transport:test
 */
import {
  acceptsLive,
  acceptsSimulation,
  isFrozen,
  transportView,
} from '../src/lib/transport.ts';
import {
  STREAMING_MS,
  THINKING_MS,
  decayStatus,
  emptyHealth,
  resolveStatus,
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
console.log('\n--- Pause is a brake, not a source switch ---\n');

check(
  'running live: the feed drives the robots',
  acceptsLive({ paused: false, simulationMode: false }),
  true,
);
check(
  'running demo: the mock tick drives the robots',
  acceptsSimulation({ paused: false, simulationMode: true }),
  true,
);
check(
  'running live: the mock tick must not fight the feed',
  acceptsSimulation({ paused: false, simulationMode: false }),
  false,
);
check(
  'running demo: the feed must not erase the demo',
  acceptsLive({ paused: false, simulationMode: true }),
  false,
);

// The bug: pausing flipped the source instead of stopping it.
check('paused -> the feed is stopped', acceptsLive({ paused: true, simulationMode: false }), false);
check(
  'paused -> the mock tick is stopped too',
  acceptsSimulation({ paused: true, simulationMode: true }),
  false,
);
check('paused is a brake on both sources', isFrozen({ paused: true, simulationMode: true }), true);

// A failed poll flips `simulationMode`; that must never silently unpause.
check(
  'mode change while paused leaves the feed stopped',
  acceptsLive({ paused: true, simulationMode: true }),
  false,
);

/* -------------------------------------------------------------------------- */
console.log('\n--- What the control says must match what it does ---\n');

check(
  'live + running -> button offers Pause, and the source is Live',
  transportView({ paused: false, simulationMode: false }),
  { action: 'Pause', status: 'Live telemetry' },
);
check(
  'demo + running -> button offers Pause, and the source is Demo',
  transportView({ paused: false, simulationMode: true }),
  { action: 'Pause', status: 'Demo telemetry' },
);
check(
  'paused -> button offers Resume, and the status says Paused',
  transportView({ paused: true, simulationMode: false }),
  { action: 'Resume', status: 'Paused' },
);
check(
  'paused (demo) -> same label, the brake outranks the source',
  transportView({ paused: true, simulationMode: true }),
  { action: 'Resume', status: 'Paused' },
);

/* -------------------------------------------------------------------------- */
console.log('\n--- STREAMING needs proof of an ongoing stream ---\n');

// `usageHistory` is written when a request COMPLETES, so a single fresh row
// proves a request just finished, not that another one is running.
check(
  'one completion 1s ago -> THINKING, not STREAMING',
  resolveStatus(1_000, health({ total: 3 }), true, 1),
  'THINKING',
);
check(
  'two completions inside the window -> STREAMING',
  resolveStatus(1_000, health({ total: 3 }), true, 2),
  'STREAMING',
);
check(
  'three completions inside the window -> STREAMING',
  resolveStatus(1_000, health({ total: 3 }), true, 3),
  'STREAMING',
);
check(
  'a burst does not keep STREAMING alive past the window',
  resolveStatus(STREAMING_MS + 1, health({ total: 3 }), true, 5),
  'THINKING',
);
check(
  'a burst past the thinking window is IDLE',
  resolveStatus(THINKING_MS + 1, health({ total: 3 }), true, 5),
  'IDLE',
);

/* -------------------------------------------------------------------------- */
console.log('\n--- A live label can never latch ---\n');

check(
  'fresh STREAMING stays STREAMING inside the window',
  decayStatus('STREAMING', STREAMING_MS - 1),
  'STREAMING',
);
check(
  'STREAMING expires to THINKING on its own',
  decayStatus('STREAMING', STREAMING_MS),
  'THINKING',
);
check('THINKING expires to IDLE on its own', decayStatus('THINKING', THINKING_MS), 'IDLE');
check('STREAMING past the thinking window is IDLE', decayStatus('STREAMING', THINKING_MS), 'IDLE');
check('IDLE never resurrects', decayStatus('IDLE', THINKING_MS * 10), 'IDLE');

// An exhausted provider is a fact, not a recency claim: it must survive.
check('ERROR is a fact and does not decay', decayStatus('ERROR', THINKING_MS * 1000), 'ERROR');

check(
  'no age can leave a STREAMING label behind',
  ['STREAMING', 'THINKING', 'IDLE'].includes(decayStatus('STREAMING', THINKING_MS * 1000)),
  true,
);

/* -------------------------------------------------------------------------- */
console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'}  ${total - failures}/${total} assertions passed`);
if (failures > 0) process.exitCode = 1;
