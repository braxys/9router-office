/**
 * Wiring tests for the agent store: pause, decay, and the source split.
 *
 * Unlike `transport-rules.mjs` (which checks pure predicates), this imports the
 * real Zustand store and drives it, so it can catch bugs that live in the
 * composition rather than in a rule.
 *
 * That distinction is not academic: the first version of this fix passed the
 * pure rule tests while the decay was completely dead in the app, because `tick`
 * was fed the render loop's `performance.now()` while `updatedAt` held a
 * `Date.now()` epoch stamp. Every age came out negative and was clamped to zero.
 * Only a test that runs the store can see that.
 *
 *   npm run store:test
 */
import { useAgentStore } from '../src/store/useAgentStore.ts';
import { STREAMING_MS, THINKING_MS } from '../src/lib/statusResolution.ts';

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

const store = () => useAgentStore.getState();
const statuses = () => store().agents.map((a) => `${a.id}:${a.status}`).join(',');
const frame = () =>
  store()
    .agents.map((a) => `${a.status}/${a.tokensPerSecond.toFixed(2)}/${a.totalTokensToday}`)
    .join('|');

const liveAgent = (over = {}) => ({
  id: 'codebuddy-intl',
  name: 'CodeBuddy',
  provider: 'codebuddy-intl',
  accentColor: '#6C4DFF',
  identity: 'codebuddy',
  status: 'STREAMING',
  tokensPerSecond: 88,
  totalTokensToday: 1000,
  latencyMs: 200,
  updatedAt: Date.now(),
  ...over,
});

const reset = () => {
  store().resetTelemetry();
  store().setPaused(false);
  store().setSimulationMode(true);
};

/* -------------------------------------------------------------------------- */
console.log('\n--- The transport brake actually stops both sources ---\n');

reset();
const beforeTick = frame();
store().tick();
check('simulation running -> tick moves the robots', frame() !== beforeTick, true);

store().setPaused(true);
const frozen = frame();
for (let i = 0; i < 5; i += 1) store().tick();
check('paused -> tick is a no-op', frame(), frozen);

// A live snapshot must not sneak past the brake either.
store().setSimulationMode(false);
store().applyLiveTelemetry([liveAgent()]);
check('paused -> a live snapshot is a no-op', frame(), frozen);

store().setPaused(false);
store().setSimulationMode(true);
const resumed = frame();
store().tick();
check('resumed -> the tick moves the robots again', frame() !== resumed, true);

/* -------------------------------------------------------------------------- */
console.log('\n--- A mode change never clears the brake ---\n');

reset();
store().setPaused(true);
// This is what `TelemetryBridge` does when a poll fails, then recovers.
store().setSimulationMode(false);
store().setSimulationMode(true);
check('a mode change cannot silently unpause', store().paused, true);
const stillFrozen = frame();
store().tick();
check('still frozen after a mode change', frame(), stillFrozen);

/* -------------------------------------------------------------------------- */
console.log('\n--- The decay runs on the same clock as `updatedAt` ---\n');

// The regression this guards: `tick` used to take a caller-supplied clock from
// the render loop (`performance.now()`), so ages were negative and nothing ever
// decayed. `updatedAt` is an epoch stamp, and `tick` must read the same clock.
reset();
store().setSimulationMode(false);
store().applyLiveTelemetry([liveAgent({ updatedAt: Date.now() - (STREAMING_MS + 1_000) })]);
const agedStreaming = statuses();
store().tick();
check(
  'a live STREAMING older than its window is demoted by one tick',
  store().agents.some((a) => a.status === 'STREAMING'),
  false,
);
check('  (it was STREAMING before the tick)', agedStreaming.includes('STREAMING'), true);

// A fresh label must survive: the decay cannot be a blanket reset.
reset();
store().setSimulationMode(false);
store().applyLiveTelemetry([liveAgent({ updatedAt: Date.now() })]);
store().tick();
check('a fresh live STREAMING survives a tick', statuses(), 'codebuddy-intl:STREAMING');

// And it must reach IDLE once past the thinking window, not stall at THINKING.
reset();
store().setSimulationMode(false);
store().applyLiveTelemetry([liveAgent({ updatedAt: Date.now() - (THINKING_MS + 1_000) })]);
store().tick();
check('a live label past the thinking window becomes IDLE', statuses(), 'codebuddy-intl:IDLE');

/* -------------------------------------------------------------------------- */
console.log('\n--- Simulation statuses are deliberate and never decay ---\n');

reset();
store().setStatus('gemini-2.5-pro', 'STREAMING', 'manual');
const manual = statuses();
store().tick();
check('a manually chosen STREAMING stays put', statuses(), manual);

/* -------------------------------------------------------------------------- */
console.log('\n--- A live label stays a measurement even after the demo takes over ---\n');

// Reachable by two ordinary paths:
//   - the bridge falls back to the mock when a poll fails, keeping the roster
//   - the user presses a mood button, which claims the demo for one robot
// Either way the OTHER robots still carry labels the feed wrote. Those are
// measurements, not a demo, so they must still expire — otherwise a provider
// whose session ended keeps saying STREAMING for the rest of the session, and
// the mock tick even adds tokens to it.
reset();
store().setSimulationMode(false);
store().applyLiveTelemetry([liveAgent({ updatedAt: Date.now() - (THINKING_MS + 1_000) })]);

store().setSimulationMode(true); // the demo takes over
const inherited = statuses();
store().tick();
check('  (the inherited label was STREAMING)', inherited.includes('STREAMING'), true);
check(
  'a live label does not become permanent when the demo takes over',
  store().agents.some((a) => a.status === 'STREAMING'),
  false,
);

// The same path must not fabricate tokens on a finished request.
reset();
store().setSimulationMode(false);
store().applyLiveTelemetry([liveAgent({ updatedAt: Date.now() - (THINKING_MS + 1_000) })]);
store().setSimulationMode(true);
const beforeDrift = store().agents[0].totalTokensToday;
for (let i = 0; i < 5; i += 1) store().tick();
check('a stale live label does not keep earning tokens', store().agents[0].totalTokensToday, beforeDrift);

// A manual mood chosen after that is deliberate and must still hold.
reset();
store().setSimulationMode(true);
store().setStatus('codebuddy-intl', 'STREAMING', 'manual');
const chosen = statuses();
store().tick();
check('a manual mood still outranks the decay', statuses(), chosen);

/* -------------------------------------------------------------------------- */
reset();
console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'}  ${total - failures}/${total} assertions passed`);
if (failures > 0) process.exitCode = 1;
