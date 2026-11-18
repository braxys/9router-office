# Four Statuses + Error Chat Bubble Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the office to exactly four statuses (`IDLE`, `THINKING`, `STREAMING`, `ERROR`), make `ERROR` mean "every usable account for this provider is dead", and render a dismissible chat bubble above each robot carrying a short human summary of the error.

**Architecture:** The status truth table stays in `src/lib/statusResolution.ts` as pure functions executed directly by `scripts/status-rules.mjs`. `describeError` is rebuilt to turn the provider's own `providerConnections.data.lastError` into one short line (cause · codes · absolute reset date · down fraction). The bubble is DOM rendered inside the existing drei `<Html>` portal in `Scene.tsx`, stacked above the name pill with CSS so the pill never moves. Dismissal state lives in `useUiStore`, never in the telemetry store.

**Tech Stack:** Next.js 16 (App Router), React 19, @react-three/fiber 9, @react-three/drei 10, three 0.187, zustand 5, Tailwind 4, node:sqlite (read-only).

**Spec:** `docs/superpowers/specs/2026-11-18-four-status-error-bubble-design.md`

## Global Constraints

- `AgentStatus` must end up as exactly `'IDLE' | 'THINKING' | 'STREAMING' | 'ERROR'`. No `FALLBACK` anywhere in `src/`, `scripts/`, or the docs. `npx tsc --noEmit` is the guard.
- **Presentation state never goes in `useAgentStore`.** Bubble dismissals live in `useUiStore` (`AGENT.md` §6).
- In-canvas store subscriptions must be primitives or `useShallow`. A re-render inside `<Canvas>` calls `invalidate()` and costs frames.
- No `Math.random()` during render. No `new THREE.*` inside `useFrame`. No `setState` in an effect body (React 19 lint).
- The 10 FPS idle / ~28 FPS active budget must hold. The bubble adds DOM only; it must not add a `useFrame` callback or a second `<Html>` portal.
- `src/lib/statusResolution.ts` stays free of `node:` imports and I/O so `scripts/status-rules.mjs` can import and execute the shipping code.
- The `.glb` body stays opt-in; the procedural robot stays the default and the default view must look unchanged when no error exists.
- Reset dates are formatted with a fixed English month table and UTC, never `toLocaleDateString` — the string is built server-side.
- Every commit step in this plan is a checkpoint, not a git command: **this repo is not a git repository**, so run the listed verification command instead of `git commit`.
- Repo facts to rely on: `ROBOT_HEIGHT` 2.365, `DESK_SEAT` owned by `WorkDesk.tsx`, dev server on port 3001, `npm run smoke` needs `?capture=1` to report `canvasNonBlank: true`.

## Review Focus

- **A provider with 1 of 3 accounts dead must NOT be `ERROR`.** It can still serve; it is `IDLE`/`THINKING`/`STREAMING` and only the bubble mentions the degradation. Getting this wrong recreates the exact `FALLBACK` lie the user rejected.
- **All accounts dead but a request landed 2 s ago.** Traffic is proof of work, so the status stays `STREAMING` for that short window before flipping to `ERROR`. Ordering in `resolveStatus` must not be "cleaned up".
- **The reset countdown is written once and never updated.** `Resets in 167h57m31s` must become an absolute date computed from `lastErrorAt + duration`; a reprinted duration becomes a lie within a day, and a live-recomputed countdown would re-render the canvas every poll and resurrect dismissed bubbles.
- **The bubble sits inside the element R3F and OrbitControls listen on.** drei appends the portal to `events.connected`; both read `offsetX/offsetY` and ignore `event.target`. Without native `stopPropagation` on the bubble, clicking `✕` raycasts the desk behind it and starts a camera orbit.
- **A stale `lastError` after a 9Router outage.** `TelemetryBridge` switches to Simulation Mode but keeps the roster, and `nextTelemetry` spreads `...agent`; without clearing, a bubble from a dead feed stays on screen forever.

---

### Task 1: Shrink `AgentStatus` to four and remove every `FALLBACK` from the app

**Files:**
- Modify: `src/lib/types.ts:1-6`
- Modify: `src/lib/agents.ts:6-10`, `:83-123`
- Modify: `src/store/useAgentStore.ts:53-62`, `:87-131`, `:133-153`, `:202-208`
- Modify: `src/components/canvas/WorkerRobot.tsx:194-235`
- Modify: `src/components/canvas/ModelRobot.tsx:235-252`, `:277-278`
- Modify: `src/components/canvas/RobotEffects.tsx:84-120`, `:295-313`
- Modify: `src/components/canvas/WorkDesk.tsx:17-23`
- Modify: `src/components/canvas/CentralHub.tsx:128-138`
- Modify: `src/components/canvas/Scene.tsx:388-396`, `:465-470`
- Modify: `src/components/hud/ControlDock.tsx:4-41`, `:86-87`, `:230`
- Modify: `src/components/CommandCenter.tsx:63-69`

**Interfaces:**
- Consumes: nothing.
- Produces: `type AgentStatus = 'IDLE' | 'THINKING' | 'STREAMING' | 'ERROR'`; `MANUAL_STATUSES: AgentStatus[]` with exactly four entries in that order; `SEED_METRICS` and `STATUS_SCREEN` keyed by the four statuses.

- [ ] **Step 1: Shrink the union**

In `src/lib/types.ts`, replace the five-member union with:

```ts
export type AgentStatus = 'IDLE' | 'THINKING' | 'STREAMING' | 'ERROR';
```

- [ ] **Step 2: Run the type checker to enumerate every break**

Run: `npx tsc --noEmit`
Expected: FAIL, listing `FALLBACK` usages in `agents.ts`, `useAgentStore.ts`, `WorkerRobot.tsx`, `ModelRobot.tsx`, `RobotEffects.tsx`, `WorkDesk.tsx`, `CentralHub.tsx`, `Scene.tsx`, `ControlDock.tsx`. This list is the checklist for the remaining steps; nothing else should be in it.

- [ ] **Step 3: Remove `FALLBACK` from the metadata and manual triggers**

In `src/lib/agents.ts`: delete the whole `FALLBACK` entry from `STATUS_META` (the one with `color: '#B98BFF'`, `expression: 'Help sign'`), and delete `'FALLBACK',` from `MANUAL_STATUSES` so it reads `['IDLE', 'THINKING', 'STREAMING', 'ERROR']`. Rewrite the `SLOT_POSITIONS` doc comment so it no longer mentions the help gesture — it should explain that desks sit on a shallow arc so the camera sees every robot's face and the hub stays visible.

- [ ] **Step 4: Remove `FALLBACK` from the store**

In `src/store/useAgentStore.ts`: delete the `FALLBACK` key from `SEED_METRICS`, the `case 'FALLBACK':` branch from `nextTelemetry`, the `case 'FALLBACK':` branch from `metricsForStatus`, and `'FALLBACK',` from the `order` array in `cycleAll` (which becomes `['IDLE', 'THINKING', 'STREAMING', 'ERROR']`).

- [ ] **Step 5: Remove the fallback body animation from both robots**

In `WorkerRobot.tsx` and `ModelRobot.tsx`, delete `const isFallback = status === 'FALLBACK';` and simplify the three channels to:

```ts
a.tilt = spring(a.tilt, isError ? 1 : 0, dt, 6);
a.armLiftR = spring(a.armLiftR, isStreaming ? 0.55 : 0, dt, 7);
a.armLiftL = spring(a.armLiftL, isError ? 1 : 0, dt, 7);
```

In `WorkerRobot.tsx` also simplify the root yaw line to `root.current.rotation.y = a.armLiftR * -0.28;` and delete the `// FALLBACK: lean toward the neighbour desk` comment. In `ModelRobot.tsx` update the arm comment to mention only the `ERROR` startle.

- [ ] **Step 6: Delete the help sign effect**

In `src/components/canvas/RobotEffects.tsx`, delete the entire exported `HelpSign` component and the `<HelpSign visible={status === 'FALLBACK'} />` line inside `RobotEffects`. Remove `help sign` from the module doc comment. Keep the local `spring` helper — `ThoughtBulb` still uses it.

- [ ] **Step 7: Remove the remaining status-keyed `FALLBACK` entries**

- `WorkDesk.tsx`: delete `FALLBACK: '#cdb2ff',` from `STATUS_SCREEN`.
- `CentralHub.tsx`: delete the `s === 'FALLBACK' ? '#b98bff' :` arm of the nested ternary.
- `Scene.tsx`: delete `a.status === 'FALLBACK',` from the `anyActive` predicate (leave `IDLE` out of it) and reword the comment at ~467 so it no longer says "during a FALLBACK".
- `ControlDock.tsx`: delete `FALLBACK: Users,` from `STATUS_ICON` and `FALLBACK: 'Raises a yellow help sign…',` from `STATUS_HINT`; delete `Users` from the `lucide-react` import list; change `xl:grid-cols-5` to `xl:grid-cols-4`; change the shortcut comment to `1..4`.
- `CommandCenter.tsx`: change the screen-reader sentence to name four states and `Keyboard shortcuts 1 through 4`.

- [ ] **Step 8: Run the type checker**

Run: `npx tsc --noEmit`
Expected: PASS, 0 errors. Any remaining `FALLBACK` is a real miss — fix it before continuing.

- [ ] **Step 9: Run the linter**

Run: `npx eslint`
Expected: PASS, 0 errors. In particular no unused `Users` import in `ControlDock.tsx`.

---

### Task 2: Rebuild the error description (cause, codes, absolute reset date)

**Files:**
- Modify: `src/lib/statusResolution.ts`
- Modify: `src/lib/routerAdapter.ts:346-362`, `:400-413`
- Test: `scripts/status-rules.mjs`

**Interfaces:**
- Consumes: nothing from Task 1 except the four-member `AgentStatus`.
- Produces:
  - `interface ConnectionHealth { total: number; down: number; errorCodes: number[]; messages: string[]; resetAt: number | null }`
  - `interface ConnectionFlag { testStatus?: string; errorCode?: number | string | null; lastError?: string | null; lastErrorAt?: string | null }`
  - `type ErrorCause = 'auth' | 'quota' | 'rate-limit' | 'unknown'`
  - `classifyProviderError(message: string | undefined, code: number | undefined): ErrorCause`
  - `parseResetMs(message: string): number | undefined`
  - `describeError(health: ConnectionHealth, now: number): string | undefined`

- [ ] **Step 1: Write the failing tests**

Append to `scripts/status-rules.mjs`, importing the new names from `../src/lib/statusResolution.ts`:

```js
console.log('\n--- classifyProviderError ---\n');

check('credits exhausted -> quota',
  classifyProviderError('Credits exhausted. Please purchase add-on packs', 429), 'quota');
check('quota reached -> quota',
  classifyProviderError('Individual quota reached. Please upgrade', 429), 'quota');
check('rate limit text -> rate-limit',
  classifyProviderError('Rate limit exceeded, too many requests', 429), 'rate-limit');
check('unauthorized text -> auth',
  classifyProviderError('Unauthorized: invalid token', 401), 'auth');
check('no message, code 401 -> auth', classifyProviderError(undefined, 401), 'auth');
check('no message, code 429 -> rate-limit', classifyProviderError(undefined, 429), 'rate-limit');
check('no message, code 500 -> unknown', classifyProviderError(undefined, 500), 'unknown');
check('nothing at all -> unknown', classifyProviderError(undefined, undefined), 'unknown');

console.log('\n--- parseResetMs ---\n');

check('167h57m31s', parseResetMs('Resets in 167h57m31s'),
  (167 * 3600 + 57 * 60 + 31) * 1000);
check('45m only', parseResetMs('resets in 45m'), 45 * 60 * 1000);
check('2d 3h', parseResetMs('resets in 2d 3h'), (2 * 24 + 3) * 3600 * 1000);
check('no reset text -> undefined', parseResetMs('Credits exhausted'), undefined);

console.log('\n--- describeError: cause + codes + reset date ---\n');

const NOW = Date.parse('2026-11-18T08:00:00.000Z');
const quotaHealth = (over = {}) => health({
  total: 5, down: 1, errorCodes: [429],
  messages: ['[429]: Individual quota reached. Resets in 167h57m31s.'],
  resetAt: Date.parse('2026-11-25T01:48:21.541Z'),
  ...over,
});

check('quota with future reset -> cause, code, date, fraction',
  describeError(quotaHealth(), NOW),
  'Quota exhausted · 429 · resets Nov 25 · 1/5 down');
check('reset date in the past is dropped',
  describeError(quotaHealth({ resetAt: NOW - 1000 }), NOW),
  'Quota exhausted · 429 · 1/5 down');
check('auth outranks quota when causes are mixed',
  describeError(health({ total: 3, down: 2, errorCodes: [401, 429],
    messages: ['Credits exhausted', 'Unauthorized: invalid token'] }), NOW),
  'Sign-in failed · 401/429 · 2/3 down');
check('no message but a 429 code -> rate limited',
  describeError(health({ total: 2, down: 1, errorCodes: [429] }), NOW),
  'Rate limited · 429 · 1/2 down');
check('no code and no message -> upstream unavailable',
  describeError(health({ total: 2, down: 1 }), NOW),
  'Upstream unavailable · 1/2 down');
check('nothing down -> undefined', describeError(health({ total: 3 }), NOW), undefined);
```

Also update the four existing `describeError` assertions near the top of the file to the new strings (`HTTP 429 · 1/3 connections down` → `Rate limited · 429 · 1/3 down`, `HTTP 500 · 1/1 connection down` → `Upstream unavailable · 500 · 1/1 down`, `upstream unavailable · 1/2 connections down` → `Upstream unavailable · 1/2 down`, and the repeated-code case → `Rate limited · 429 · 3/3 down`), and add `messages: []`, `resetAt: null` to the `health()` helper's spread defaults by extending `emptyHealth()` in the source.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run status:test`
Expected: FAIL — `classifyProviderError is not a function` (or an import error), plus the rewritten `describeError` expectations.

- [ ] **Step 3: Implement the health fields and helpers**

In `src/lib/statusResolution.ts`:

- Extend `ConnectionFlag` with `lastError?: string | null; lastErrorAt?: string | null`.
- Extend `ConnectionHealth` with `messages: string[]` and `resetAt: number | null`; extend `emptyHealth()` to return `messages: []` and `resetAt: null`.
- In `summariseConnections`, inside the existing `unavailable` branch, also push `row.connection.lastError` (when non-empty) into `messages`, and fold the reset instant in: `const reset = row.connection.lastErrorAt ? Date.parse(row.connection.lastErrorAt) + (parseResetMs(row.connection.lastError ?? '') ?? 0) : 0;` keeping the **maximum** of finite positive candidates in `resetAt` (the last account to come back is the one that matters). Note `Date.parse` returns `NaN` for a bad string — guard with `Number.isFinite`.

Then add, above `describeError`:

```ts
export type ErrorCause = 'auth' | 'quota' | 'rate-limit' | 'unknown';

export function classifyProviderError(
  message: string | undefined,
  code: number | undefined,
): ErrorCause;

export function parseResetMs(message: string): number | undefined;
```

`classifyProviderError` rules: lowercase the message; `quota` or `credits exhausted` → `'quota'`; `rate limit` or `too many requests` → `'rate-limit'`; `unauthor`, `forbidden` or `invalid token` → `'auth'`; message checked before code; with no message, `401`/`403` → `'auth'`, `429` → `'rate-limit'`, else `'unknown'`.

`parseResetMs` accepts `(\d+)h`, `(\d+)m`, `(\d+)s` and `(\d+)d` in any combination after `resets in`, case-insensitive, and returns total milliseconds or `undefined` when nothing matches.

- [ ] **Step 4: Rebuild `describeError`**

Signature `describeError(health: ConnectionHealth, now: number): string | undefined`. Return `undefined` when `health.down === 0`. Otherwise build up to four ` · `-joined parts:

1. Cause label, ranked `auth` > `quota` > `rate-limit` > `unknown` across every message (`classifyProviderError(message, undefined)`) and, when there are no messages, across `health.errorCodes`: `auth` → `Sign-in failed`, `quota` → `Quota exhausted`, `rate-limit` → `Rate limited`, `unknown` → `Upstream unavailable`.
2. Codes: `health.errorCodes` deduped, sorted ascending, joined with `/`, when non-empty.
3. Reset date: only when `health.resetAt` is non-null **and** `> now`; format `resets ${MONTHS[utcMonth]} ${utcDay}` with a module-level `['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']` table and `getUTCMonth()` / `getUTCDate()`.
4. Fraction: `${health.down}/${health.total} down`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run status:test`
Expected: PASS, all assertions including the pre-existing 27 (now updated) and the new ones. The script prints `all status rules behave as specified`.

- [ ] **Step 6: Feed the real data in**

In `src/lib/routerAdapter.ts`, the `ConnectionRowLike` mapping must now pass the message through — it already spreads the parsed flag object as `connection`, so confirm `lastError`/`lastErrorAt` survive JSON parsing (they do; no code change needed there). Change the `describeError(providerHealth)` call to `describeError(providerHealth, now)`.

- [ ] **Step 7: Verify against the live database**

Run: `npm run status:live`
Expected: `antigravity` prints `Quota exhausted · 429 · resets <a future date> · 1/5 down`, `codebuddy-intl` prints `Quota exhausted · 429 · 1/3 down` with no date (its message has no reset text), and no provider prints `FALLBACK`.

---

### Task 3: Make `ERROR` mean "every usable account is dead"

**Files:**
- Modify: `src/lib/statusResolution.ts:105-130`
- Test: `scripts/status-rules.mjs`

**Interfaces:**
- Consumes: `ConnectionHealth` from Task 2.
- Produces: `resolveStatus(msSinceLast: number, health: ConnectionHealth, hasTraffic: boolean): AgentStatus` with the `FALLBACK` branch gone.

- [ ] **Step 1: Rewrite the failing tests**

In `scripts/status-rules.mjs`, replace the two `FALLBACK`-expecting cases in the `resolveStatus` block with three cases (the third pins the boundary that already existed):

```js
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
```

And in the end-to-end block, change `'idle + 1/3 down -> FALLBACK (correct: genuinely degraded)'` to expect `'IDLE'`, and add:

```js
check(
  'all three accounts exhausted -> ERROR (the user-reported case)',
  resolveStatus(600_000, summariseConnections([
    { provider: 'codebuddy-intl', isActive: 1, connection: { testStatus: 'unavailable', errorCode: 429, lastError: 'Credits exhausted' } },
    { provider: 'codebuddy-intl', isActive: 1, connection: { testStatus: 'unavailable', errorCode: 429, lastError: 'Credits exhausted' } },
    { provider: 'codebuddy-intl', isActive: 1, connection: { testStatus: 'unavailable', errorCode: 429, lastError: 'Credits exhausted' } },
  ]).get('codebuddy-intl'), true),
  'ERROR',
);
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run status:test`
Expected: FAIL on the two `IDLE` cases, reporting `actual: 'FALLBACK'`.

- [ ] **Step 3: Delete the branch**

In `resolveStatus`, remove `if (health.down > 0) return 'FALLBACK';` and rewrite the doc comment's priority list to five steps: no traffic → `IDLE`; fresh request → `STREAMING`; request inside the thinking window → `THINKING`; every usable connection unavailable → `ERROR`; otherwise `IDLE`. Keep the paragraph explaining why traffic outranks flags.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run status:test`
Expected: PASS. `tsc --noEmit` must also stay clean, since `'FALLBACK'` is no longer assignable to `AgentStatus`.

---

### Task 4: Simulation error text and stale-error cleanup in the store

**Files:**
- Modify: `src/store/useAgentStore.ts:133-153`, `:87-131`

**Interfaces:**
- Consumes: nothing.
- Produces: `metricsForStatus('ERROR')` returns a `lastError` with a `Date.now()` stamp; `nextTelemetry` returns `lastError: undefined` on its non-`ERROR` branches.

- [ ] **Step 1: Stamp the simulated error**

In `metricsForStatus`, the `ERROR` case becomes:

```ts
return {
  tokensPerSecond: 0,
  latencyMs: 0,
  lastError: `Quota exhausted · 429 · ${Date.now()}`,
};
```

The stamp is what lets a dismissed bubble come back when `ERROR` is triggered again — simulation always reuses the same sentence, so without it the close button would silence that agent for the whole session.

- [ ] **Step 2: Clear stale errors on the passive tick**

In `nextTelemetry`, add `lastError: undefined` to the returned objects for the `STREAMING`, `THINKING` and default (`IDLE`) branches. Leave the `ERROR` branch spreading `...agent` so its text survives.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` then `npx eslint`
Expected: both PASS. There is no unit test for the store (it is client state); the behaviour is proven in Task 6 by triggering `ERROR` twice in the running app.

---

### Task 5: Dismissal state in `useUiStore`

**Files:**
- Modify: `src/store/useUiStore.ts:31-39`, `:68-92`

**Interfaces:**
- Consumes: nothing.
- Produces: `dismissedErrors: Record<string, string>` and `dismissError(agentId: string, error: string): void` on `useUiStore`.

- [ ] **Step 1: Add the state**

Extend `UiStore` with:

```ts
/** agentId -> the exact lastError text the user closed. Session-only. */
dismissedErrors: Record<string, string>;
dismissError: (agentId: string, error: string) => void;
```

Add `dismissedErrors: {}` to the store's initial values and:

```ts
dismissError: (agentId, error) =>
  set((state) => ({ dismissedErrors: { ...state.dismissedErrors, [agentId]: error } })),
```

Do **not** persist it through `persist()` and do **not** add it to `UiPrefs`: a dismissal from yesterday must not silence today's failure, and `hydrate()` must keep returning the defaults for it.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit` then `npx eslint`
Expected: both PASS.

---

### Task 6: Render the chat bubble above the name pill

**Files:**
- Modify: `src/components/canvas/Scene.tsx:75-209`

**Interfaces:**
- Consumes: `dismissedErrors` / `dismissError` from Task 5; `AgentTelemetry.lastError` from Task 2.
- Produces: nothing importable — this is the user-visible deliverable.

- [ ] **Step 1: Subscribe to the two strings**

In `AgentNode`, next to the existing primitive selectors:

```ts
const lastError = useAgentStore(
  (s) => s.agents.find((a) => a.id === id)?.lastError ?? '',
);
const dismissed = useUiStore((s) => s.dismissedErrors[id]);
const dismissError = useUiStore((s) => s.dismissError);
const showBubble = lastError !== '' && dismissed !== lastError;
```

Import `useUiStore` from `@/store/useUiStore`. Both selectors return strings, so zustand's default `Object.is` comparison keeps a latency-only telemetry tick from re-rendering this subtree — do not widen them to objects.

- [ ] **Step 2: Add the native event guard**

Inside `AgentNode`, add a ref and an effect that stops pointer events before R3F and `OrbitControls` see them. The portal is appended to `events.connected`, which is the same element both listen on, and both read `offsetX/offsetY` instead of `event.target`; React handlers run too late because React delegates at the root.

```ts
const bubbleRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  const el = bubbleRef.current;
  if (!el) return;
  const stop = (event: Event) => event.stopPropagation();
  el.addEventListener('pointerdown', stop);
  el.addEventListener('click', stop);
  el.addEventListener('dblclick', stop);
  el.addEventListener('wheel', stop, { passive: true });
  return () => {
    el.removeEventListener('pointerdown', stop);
    el.removeEventListener('click', stop);
    el.removeEventListener('dblclick', stop);
    el.removeEventListener('wheel', stop);
  };
}, [showBubble]);
```

- [ ] **Step 3: Stack the bubble above the pill**

Wrap the existing pill markup in a positioning div and render the bubble before it. The pill's own classes, colours and content must not change — it may not shift by a pixel when a bubble appears.

```tsx
<div style={{ position: 'relative' }}>
  {showBubble && (
    <div
      ref={bubbleRef}
      className="absolute bottom-[calc(100%+8px)] left-1/2 flex max-w-[210px] -translate-x-1/2 items-start gap-1.5 rounded-2xl border-2 px-2 py-1.5"
      style={{
        backgroundColor: 'rgba(255, 253, 248, 0.97)',
        borderColor: '#FF6B7A',
        boxShadow: '0 2px 0 #FF6B7A33',
        pointerEvents: 'auto',
      }}
    >
      <span className="text-[10px] leading-tight font-extrabold text-[#c23a4c]">
        {lastError}
      </span>
      <button
        type="button"
        aria-label={`Dismiss error for ${name}`}
        onClick={() => dismissError(id, lastError)}
        className="shrink-0 cursor-pointer rounded-full px-1 text-[10px] leading-none font-extrabold text-[#c23a4c] hover:bg-[#FF6B7A]/15"
      >
        ✕
      </button>
      <span
        className="absolute top-full left-1/2 h-0 w-0 -translate-x-1/2 border-x-[5px] border-t-[6px] border-x-transparent"
        style={{ borderTopColor: '#FF6B7A' }}
        aria-hidden
      />
    </div>
  )}
  {/* existing pill markup, unchanged */}
</div>
```

Keep the surrounding `<Html position={[0, 2.45, -0.3]} center zIndexRange={[15, 0]} pointerEvents="none" style={{ pointerEvents: 'none' }}>` exactly as it is; the bubble re-enables pointer events on itself only.

- [ ] **Step 4: Verify types and lint**

Run: `npx tsc --noEmit` then `npx eslint`
Expected: both PASS.

- [ ] **Step 5: Verify the bubble in a real browser**

Start the dev server (`npm run dev`), open `http://localhost:3001`, press `4` (the `ERROR` trigger), and confirm: a red bubble appears above the pill with `Quota exhausted · 429 · <timestamp>`; the pill has not moved; clicking `✕` hides the bubble; pressing `4` again after switching to another status brings it back with a new stamp. Then press `1` (`IDLE`) and confirm no bubble appears.

- [ ] **Step 6: Verify the pointer guard**

With an error bubble visible, click `✕` and confirm the desk does **not** become selected and no camera flight starts. Then press-and-drag starting on the bubble body and confirm the camera does not orbit; drag on empty canvas and confirm it still does.

---

### Task 7: Update the operational scripts

**Files:**
- Modify: `scripts/smoke.mjs:160`, `:172`, `:186-191`
- Modify: `scripts/explain-status.mjs:5`, `:74-91`

**Interfaces:**
- Consumes: `describeError(health, now)` from Task 2.
- Produces: nothing importable.

- [ ] **Step 1: Four states in the smoke script**

In `scripts/smoke.mjs`, change both hard-coded lists to `['IDLE', 'THINKING', 'STREAMING', 'ERROR']`.

- [ ] **Step 2: Assert the bubble text appears**

Replace the `after` block at the end of the trigger loop with a check that the bubble is on screen after `ERROR`:

```js
const after = await evaluate(`(() => {
  const t = document.body.innerText || '';
  const bubble = [...document.querySelectorAll('button')]
    .find(b => (b.getAttribute('aria-label') || '').startsWith('Dismiss error for'));
  return {
    stillHasError: t.includes('ERROR'),
    bubbleVisible: !!bubble,
    bubbleLabel: bubble ? bubble.getAttribute('aria-label') : null,
  };
})()`);
console.log('after-trigger check:', JSON.stringify(after));
```

- [ ] **Step 3: Update the live reporter**

In `scripts/explain-status.mjs`, change the header comment so it no longer says a `FALLBACK` label can be traced, and pass `now` to `describeError(h, now)`.

- [ ] **Step 4: Verify the smoke gate**

Run the dev server, then `node scripts/smoke.mjs --trigger-states`
Expected: `states` lists all four, `contextLost: false`, `canvasNonBlank: true`, zero page errors, zero console errors, and `bubbleVisible: true` in the after-trigger check.

---

### Task 8: Update the project documentation

**Files:**
- Modify: `AGENT.md:17-19`, `:57-59`, `:107-110`, `:130-133`
- Modify: `ARCHITECTURE.md:27-33`, `:120-135`, `:164-169`, `:175-184`
- Modify: `TASKS.md`

**Interfaces:**
- Consumes: the behaviour built in Tasks 1-7.
- Produces: nothing importable.

- [ ] **Step 1: `AGENT.md`**

- §2: the status list becomes `IDLE`, `THINKING`, `STREAMING`, `ERROR`; replace "help signs" with "error chat bubbles".
- §5: the shortcut range becomes `1`–`4`; add one line saying each desk's pill can carry a dismissible error bubble.
- §6: replace the `FALLBACK`-mentioning sentence in the traffic-outranks-flags rule with the new meaning (`ERROR` only when every usable account is unavailable), and add a rule that the error bubble's text is built from `providerConnections.data.lastError` plus an absolute reset date derived from `lastErrorAt`, never a reprinted countdown.
- §7: append `Phase 4.6 (done)` describing the four-status model and the bubble.

- [ ] **Step 2: `ARCHITECTURE.md`**

- §2: delete the `FALLBACK` row from the animation matrix; add a paragraph stating `ERROR` is reserved for a provider with zero usable accounts and that partial degradation is surfaced by the bubble instead of a status.
- §4: add `useUiStore`'s new fields to the directory map description.
- §5: add a bullet describing `dismissedErrors` (text-keyed, session-only, never in the telemetry store) and the bubble's native pointer-event guard with its reason.
- §5b/§6: update any sentence that lists five statuses.

- [ ] **Step 3: `TASKS.md`**

Delete or rewrite every `FALLBACK` checklist line so the file describes four statuses, and add a Phase 4.6 section listing: union shrunk, `describeError` rebuilt, bubble added, dismissal store, scripts and docs updated.

- [ ] **Step 4: Verify no stale references remain**

Run: `rg -n "FALLBACK" src scripts AGENT.md ARCHITECTURE.md TASKS.md`
Expected: no output. (`artifacts/diagnose-codebuddy.mjs` is a historical one-off and is allowed to keep its wording; it is outside this search.)

---

### Task 9: Full gate run

**Files:** none.

**Interfaces:**
- Consumes: everything above.
- Produces: a green build.

- [ ] **Step 1: Run the static gates**

```bash
npx tsc --noEmit
npx eslint
npm run status:test
```

Expected: 0 errors from `tsc`, 0 from `eslint`, and `status:test` printing `all status rules behave as specified`.

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: succeeds with no type or lint errors.

- [ ] **Step 3: Run the smoke and perf gates**

With the dev server on port 3001:

```bash
node scripts/smoke.mjs --trigger-states
node scripts/perf.mjs
```

Expected: smoke reports four states, `canvasNonBlank: true`, `contextLost: false`, `bubbleVisible: true`, zero page and console errors. Perf reports ~10 FPS idle and ~28 FPS active; a large regression means the bubble widened a subscription.

- [ ] **Step 4: Capture the visual proof**

Use `scripts/shot.mjs` (filename as argv[2], `CDP_PORT` default 9224, `TARGET_URL` default `http://localhost:3055/?capture=1`) to capture one frame with a live error bubble and one with a healthy roster, and confirm the healthy frame is visually identical to the pre-change default view.

- [ ] **Step 5: Confirm the live mapping once more**

Run: `npm run status:live`
Expected: antigravity `IDLE` with `Quota exhausted · 429 · resets <date> · 1/5 down`, codebuddy `IDLE` with `Quota exhausted · 429 · 1/3 down`, and no `FALLBACK` anywhere.
