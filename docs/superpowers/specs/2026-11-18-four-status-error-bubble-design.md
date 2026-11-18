# Four statuses + error chat bubble

Date: 2026-11-18
Status: awaiting approval

## 1. Intent and why

The office currently has five statuses. `FALLBACK` was meant to say "degraded, some
accounts are down", but in practice it lies: it fires whenever *any* usable account is
flagged `unavailable`, so a provider with 2 of 3 accounts still serving traffic reads as
`FALLBACK`. The user saw exactly that — CodeBuddy Account 1 at 0 % quota while Accounts 2
and 3 still held 33 % and 57 % — and read `FALLBACK` as "this provider is broken". The
label was technically accurate and practically misleading.

The request, in the user's words:

> buat menjadi 4 saja, idle, thinking, streaming, dan error
>
> ketika kuota habis masukkan dalam kategori error, setiap terdeteksi error buat robotnya
> muncul seperti "chat" di atas informasi error apa yang terjadi

So: shrink the model to four states, fold "quota exhausted" into `ERROR`, and let the
robot say what went wrong instead of encoding severity in a fifth label.

## 2. Goals

- `AgentStatus` is exactly `IDLE | THINKING | STREAMING | ERROR`. `FALLBACK` is gone from
  the type, the store, the HUD, both robot bodies, the status effects, the smoke script and
  the docs. A stale `FALLBACK` anywhere becomes a `tsc` error, not a silent gap.
- A provider whose usable connections are **all** unavailable reports `ERROR`. "Quota
  exhausted" is one way to get there, and it is the case the user named.
- Every detected error renders a dismissible chat bubble above the robot carrying a short
  human summary plus the code, e.g. `Quota exhausted · 429 · resets Nov 25`.
  *(Amended: "every detected error" was narrowed by the user to the all-accounts-dead case only —
  see §6. Partial outages show nothing.)*
- The default office view is unchanged when nothing is failing.

## 3. Non-goals

- No quota *percentage* anywhere. The live database has no quota table; remaining-percent
  cannot be read, so it is not shown and not guessed.
- No new animation for the new mapping. `ERROR` already has a startle hop, 45° head tilt,
  X X eyes and monitor smoke; that is the performance for "all accounts dead" too.
- No changes to `usageHistory` handling, ranking, polling, or the `applyLiveTelemetry`
  contract. The bridge stays additive.
- No `README.md` rewrite here (still the `create-next-app` template — tracked separately).
- `artifacts/diagnose-codebuddy.mjs` keeps its historical `FALLBACK` wording; it is a
  one-off diagnostic, not shipping code.

## 4. Constraints

- `AGENT.md` §6 still rules: the Zustand telemetry store is the source of truth, and
  **presentation state never lives in it**. Bubble dismissals are a presentation
  preference and go in `useUiStore`.
- In-canvas subscriptions stay value-compared (`useShallow` or primitive selectors). Any
  re-render inside `<Canvas>` invalidates the demand loop.
- The 10 FPS idle / 28 FPS active budget must hold. The bubble must not add a `useFrame`
  callback or a second drei `<Html>` portal per agent.
- No `Math.random()` during render; no `new THREE.*` inside `useFrame`.
- `tsc`, `eslint`, `next build`, `npm run status:test`, `npm run smoke` and `npm run perf`
  all pass before this is called done.

## 5. Approaches

### A. Second `<Html>` portal per agent, offset in world units

Rejected after reading `node_modules/@react-three/drei/web/Html.js`. drei projects the
anchor to pixels but keeps content at a constant CSS size, so a gap expressed in world
units (`y=2.45` → `2.85`) becomes a *different pixel gap at every zoom*. In the overview
shot that gap can be smaller than the pill is tall, so the bubble overlaps the pill it is
supposed to sit above. A second portal also doubles the per-frame projection work.

### B. Sprite / canvas texture in 3D

Rejected. Correct occlusion and depth, but text blurs at overview distance unless the
texture is regenerated at high resolution for every message, needs a new `CanvasTexture`
per error, and the "dismissible" requirement forces a raycast hitbox. The requirement and
the technique fight each other.

### C. One portal, bubble stacked in CSS — **chosen**

Keep the existing `<Html>` portal exactly where it is. Wrap its children in a
`position: relative` div sized to the pill, and render the bubble as
`position: absolute; bottom: calc(100% + 8px)`. The anchor stays on the pill, so the pill
does not move by a single pixel when a bubble appears or disappears; the gap is 8 CSS px at
every zoom level; the close control is a real `<button>`; and no extra `useFrame` or portal
is added.

The user picked "portal `<Html>` kedua"; this is the same intent (pill untouched, bubble
floating above it, dismissible) implemented without the overlap defect described in A. The
deviation is called out here rather than hidden.

## 6. The four statuses

`src/lib/types.ts`:

```ts
export type AgentStatus = 'IDLE' | 'THINKING' | 'STREAMING' | 'ERROR';
```

`src/lib/statusResolution.ts` — the priority list loses one step:

```
1. no traffic in the window                  -> IDLE
2. a request finished moments ago            -> STREAMING
3. a request inside the thinking window      -> THINKING
4. every usable connection is unavailable    -> ERROR
5. otherwise                                 -> IDLE
```

Steps 2-3 stay ahead of step 4. Traffic is proof of work; a flag is a statement about
capacity, and proof wins while it is fresh. This is the existing rule and it does not
change — only the `down > 0 -> FALLBACK` line is deleted.

Consequence, stated plainly: a provider with 2 of 3 accounts dead and no recent request is
`IDLE`, not `ERROR`. It can still serve, so calling it an error would be the same lie in a
different costume. Nothing is shown for that case at all — no status change and no bubble.

> **Amended 2026-11-18 (user ruling, restated twice).** The bubble was narrowed to the *same*
> all-accounts-dead condition as `ERROR`: `routerAdapter` only sets `lastError` when
> `total > 0 && down === total`. The paragraph above originally said the bubble would report
> partial degradation; the user explicitly rejected that, because a red bubble over a provider
> that is still answering requests recreates the "degraded reads as broken" misreading in a new
> place. Partial outages are therefore silent. `describeError` itself still formats any non-zero
> `down`, so the truth table keeps covering the full formatter.

## 7. Where the error text comes from

`providerConnections.data` already carries the provider's own failure message. Live
samples:

- antigravity — `[429]: Individual quota reached. Please upgrade your subscription to
  increase your limits. Resets in 167h57m31s.`
- codebuddy-intl — `[429]: {"error":{"data":{"code":14018,"msg":"Credits exhausted.
  Please visit the link below to purchase add-on packs …"}}}`

So the bubble can be concrete instead of a bare code. Three pure helpers join
`statusResolution.ts` (still no `node:` imports, still executed directly by
`scripts/status-rules.mjs`):

- `classifyProviderError(message, code): 'auth' | 'quota' | 'rate-limit' | 'unknown'` —
  message first (`quota` / `credits exhausted` → `quota`; `rate limit` / `too many requests`
  → `rate-limit`; `unauthor` / `forbidden` / `invalid token` → `auth`), then the code when
  there is no message (401/403 → `auth`, 429 → `rate-limit`, else `unknown`).
- `parseResetMs(message): number | undefined` — pulls the duration out of
  `Resets in 167h57m31s`, `resets in 45m`, `resets in 2d 3h`; returns milliseconds.
- `describeError(health, now)` — one line, ` · ` separated.

`ConnectionHealth` gains two fields, both filled by `summariseConnections` from the rows it
already counts as down — keeping the paused/unavailable rules in exactly one place rather
than re-filtering rows in `routerAdapter`:

- `messages: string[]` — each down row's `connection.lastError`.
- `resetAt: number | null` — the earliest **future** reset instant across down rows,
  computed as `lastErrorAt + parseResetMs(message)`.

### Why an absolute date and not a countdown

The provider writes `Resets in 167h57m31s` **once**, when the account fails. 9Router only
rewrites it on the next failed re-test, so reprinting `resets in 167h` three days later is a
frozen lie; and recomputing "time remaining" every poll would make `lastError` a value that
changes constantly — re-rendering inside `<Canvas>` on every tick and resurrecting the
bubble after every dismissal. `lastErrorAt + duration` is a fixed **instant**, so the text
is stable by construction: it does not decay, and it needs no timer.

It is omitted when the instant is already in the past — the quota should have returned and
9Router simply has not re-tested yet, and printing a past date reads as broken. Formatting
uses a fixed UTC month table (`Jan`…`Dec`), never `toLocaleDateString`, because this string
is built on the server and must not depend on the server's locale.

| situation | output |
| --- | --- |
| all down, quota, reset in future | `Quota exhausted · 429 · resets Nov 25 · 3/3 down` |
| 1/5 down, quota, reset in future (live antigravity) | `Quota exhausted · 429 · resets Nov 25 · 1/5 down` |
| 1/3 down, quota, no reset text (live codebuddy) | `Quota exhausted · 429 · 1/3 down` |
| rate limited | `Rate limited · 429 · 1/3 down` |
| bad credentials | `Sign-in failed · 401 · 1/3 down` |
| 429 with no message at all | `Rate limited · 429 · 1/2 down` |
| no code, no message | `Upstream unavailable · 1/2 down` |
| nothing down | `undefined` |

**Mixed causes** — when down rows disagree, the cause is ranked `auth` > `quota` >
`rate-limit` > `unknown`: most permanent first, because the most permanent cause is the one
a human has to act on. Codes are deduped, sorted ascending and joined with `/`, so
`Sign-in failed · 401/429 · 2/3 down` is possible and deterministic.

`AgentTelemetry.lastError` stays a single `string | undefined` — no new type, no second
field. The HUD spotlight already renders it and keeps working; its wording just gets
friendlier. Simulation `ERROR` seeds a stamped text (see §9) so the bubble has something to
show without a live database.

## 8. The bubble

Rendered inside `AgentNode` in `src/components/canvas/Scene.tsx`, in the existing `<Html>`
portal, wrapped around the current name + status pill:

```
                 ┌───────────────────────────────┐
                 │ ⚠ Quota exhausted · 429       ✕│   <- bubble: cream card,
                 │   resets Nov 25 · 5/5 down     │      red border, red text,
                 └──────────────▼────────────────┘      small tail pointing down
                          ● CodeBuddy  ERROR            <- existing pill, unmoved

  (The pill under a bubble always reads ERROR and the count is always n/n, since the bubble is
   gated on every usable account being down. An earlier sketch showed STREAMING with "1/3 down";
   that combination can no longer occur — the user rejected partial-outage bubbles.)
```

- Visible when `lastError` is non-empty **and** the user has not dismissed *that exact
  text*. `lastError` is itself only set for the all-accounts-dead case (see the §6 amendment),
  so the bubble can only ever appear on an `ERROR` desk — never over a provider that is still
  serving. The original wording here said "every status can show it"; the user rejected that.
- `position: absolute; bottom: calc(100% + 8px); left: 50%; transform: translateX(-50%)`
  on a `relative` pill wrapper: pill pixel-stable, gap constant at every zoom.
- `max-w-[210px]`, `text-[10px]`, wraps to at most three lines. Four desks are 3.2 m apart,
  so at overview zoom neighbouring bubbles can graze each other; the short text and the
  narrow width keep that rare and harmless.
- The tail is a CSS triangle, not geometry.
- Close button: `<button type="button" aria-label="Dismiss error for <name>">`, 14 px hit
  area, `pointer-events: auto` on the bubble while the portal stays `pointer-events: none`.
  A child may re-enable pointer events under a `none` parent, so the pill keeps ignoring
  the mouse and the button still clicks.
- No `distanceFactor` — same reason as the pill: constant on-screen size reads in both the
  overview and a focus shot.

### Event isolation is not free — the bubble must swallow pointer events itself

drei appends the portal to `events.connected || gl.domElement.parentNode`
(`drei/web/Html.js:123`). R3F sets `events.connected` to its own wrapper `<div>`
(`fiber …/react-three-fiber.esm.js:67,103`), attaches every DOM handler natively to that
div (`fiber …/events-*.js:17822-17842`), and drei's `OrbitControls` listens on the same
element (`drei/core/OrbitControls.js:27`). The portal is therefore a **child of the element
both R3F and OrbitControls listen on**, and both read `offsetX/offsetY` rather than
`event.target`. A click on `✕` would raycast the desk behind it and start a camera orbit.

React handlers cannot fix this: React delegates at the root container, so the native
listener on the R3F div runs first. The bubble wrapper therefore attaches **native**
listeners from a `ref` effect and stops them:

```ts
const stop = (e: Event) => e.stopPropagation();
el.addEventListener('pointerdown', stop);
el.addEventListener('click', stop);
el.addEventListener('dblclick', stop);
el.addEventListener('wheel', stop, { passive: true });
```

All four, because each maps to a separate R3F handler in `DOM_EVENTS` and a separate
`OrbitControls` interaction. Scope: the **whole bubble** is inert, not just the button — a
drag that starts on the bubble must not rotate the camera either. The pill and the desk
stay clickable exactly as they are today.

## 9. Dismissal

Lives in `src/store/useUiStore.ts`, never in `useAgentStore`:

```ts
/** agentId -> the lastError text the user dismissed. Session-only, not persisted. */
dismissedErrors: Record<string, string>;
dismissError: (agentId: string, error: string) => void;
clearDismissedError: (agentId: string) => void;
```

Keyed by the error *text*: the bubble returns by itself the moment the message changes (a
different code, a different cause, a different reset date). Dismissals are deliberately not
written to `localStorage`: a dismissal from yesterday must not silence today's failure.

**A dismissal expires with the failure.** Keying on text alone is not enough, because live
codebuddy's message carries no reset duration — `Quota exhausted · 429 · 3/3 down` is
byte-identical on every occurrence. Dismiss it once, let the quota recover and die again, and the
stored key would suppress the new bubble for the whole session. So `AgentNode` calls
`clearDismissedError(id)` whenever `lastError` becomes empty: a dismissal only outlives the
failure it dismissed, never the provider.

**Simulation `ERROR` re-triggers.** Simulation always seeds the same sentence, so dismissing it
and pressing `ERROR` again would otherwise stay silent — the one path a user without a live
9Router has for trying the bubble. `metricsForStatus` therefore seeds
`Demo · Quota exhausted · 429 · <HH:MM:SS.mmm UTC>` for simulation only, and `setStatus`
re-stamps even when the robot is already in `ERROR` instead of returning early. The `Demo ·`
prefix keeps the text from being mistaken for telemetry: the trigger applies it to whichever
*live* provider is selected, so without it the office would show "Quota exhausted · 429" over a
provider with every account healthy. The live path never does any of this: its text is
`describeError`'s output, which is date-free and stable.

**Outage.** `TelemetryBridge` switches to Simulation Mode when 9Router disappears but leaves
the roster in place, and the passive `tick` path spreads `...agent`, so a stale `lastError`
would otherwise sit on a robot that is no longer reporting anything real. Two things clear it:
`nextTelemetry` clears `lastError` on its `IDLE`/`THINKING`/`STREAMING` branches, and
`handleDisconnected` calls `clearErrors()` before switching modes — the `ERROR` branch keeps the
text, because a simulated error is exactly the case that needs a bubble, and that would otherwise
preserve a *live* bubble indefinitely across a dead feed.

`AgentNode` subscribes with primitives only:

```ts
const lastError = useAgentStore((s) => s.agents.find((a) => a.id === id)?.lastError ?? '');
const dismissed = useUiStore((s) => s.dismissedErrors[id]);
const showBubble = lastError !== '' && dismissed !== lastError;
```

Both are strings, so zustand's default `Object.is` comparison already keeps a telemetry
tick that only moves latency from re-rendering the subtree. No `useShallow` needed. The
dismissed entry is never pruned: it is one short string per agent (four agents maximum), and
pruning it on re-render would be state written during render.

## 10. Files touched

| File | Change |
| --- | --- |
| `src/lib/types.ts` | `AgentStatus` loses `FALLBACK` |
| `src/lib/agents.ts` | drop `FALLBACK` from `STATUS_META` and `MANUAL_STATUSES`; reword the slot comment that mentions the help gesture |
| `src/lib/statusResolution.ts` | drop the `FALLBACK` branch; `ConnectionHealth` gains `messages` + `resetAt`; add `classifyProviderError`, `parseResetMs`; rebuild `describeError(health, now)` |
| `src/lib/routerAdapter.ts` | pass `connection.lastError` and `lastErrorAt` through in the row mapping; pass `now` to `describeError` |
| `src/store/useAgentStore.ts` | `SEED_METRICS`, `nextTelemetry`, `metricsForStatus`, `cycleAll` lose `FALLBACK`; simulation `ERROR` text gains an event stamp; `nextTelemetry` clears `lastError` outside `ERROR` |
| `src/store/useUiStore.ts` | `dismissedErrors` + `dismissError` |
| `src/components/canvas/Scene.tsx` | bubble markup, native pointer-event guard, two primitive subscriptions; drop `FALLBACK` from the active-agent filter and the comment at ~467 |
| `src/components/canvas/RobotEffects.tsx` | delete `HelpSign` and its usage; drop the now-unused `spring` import if nothing else uses it |
| `src/components/canvas/WorkerRobot.tsx` | drop `isFallback`; simplify tilt / arm lift / root yaw |
| `src/components/canvas/ModelRobot.tsx` | same channels, same simplification |
| `src/components/canvas/WorkDesk.tsx` | `STATUS_SCREEN` loses `FALLBACK` |
| `src/components/canvas/CentralHub.tsx` | drop the `FALLBACK` lamp colour |
| `src/components/hud/ControlDock.tsx` | drop `FALLBACK` icon/hint, drop the now-unused `Users` import, `xl:grid-cols-5` → `4`, shortcut comment `1..4` |
| `src/components/CommandCenter.tsx` | screen-reader text: four states, shortcuts 1–4 |
| `scripts/status-rules.mjs` | rewrite `FALLBACK` cases as `IDLE`/`ERROR`; cover `classifyProviderError`, `parseResetMs`, cause ranking, code dedupe, reset-date omission in the past, and the exact `describeError` strings |
| `scripts/explain-status.mjs` | drop the `FALLBACK` wording, print the bubble text |
| `scripts/smoke.mjs` | four-state list; assert the bubble text appears after triggering `ERROR` |
| `AGENT.md`, `ARCHITECTURE.md`, `TASKS.md` | four-status model, bubble behaviour, Phase 4.6 entry |

## 11. Left to the builder

- Exact bubble colours: reuse the existing toy-card language (`#FF6B7A` border and text on
  the cream `rgba(255, 253, 248, 0.94)` already used by the pill) rather than inventing a
  palette.
- Whether the bubble shows a warning glyph or the status dot; the sketch assumes a glyph.
- `max-w` fine-tuning between 190 and 230 px once seen at overview zoom.
- Test names and grouping in `status-rules.mjs`.
- Whether `explain-status.mjs` prints the reset date separately or as part of the line.

## 12. Verification

1. `npm run status:test` — rewritten truth table passes, including: all-down + quiet →
   `ERROR`, all-down + fresh traffic → `STREAMING`, 1/3 down + quiet → `IDLE` (no
   `FALLBACK`), quota message → `Quota exhausted · 429 · …`, reset date in the future kept
   and in the past dropped, mixed causes ranked `auth` > `quota` > `rate-limit`, codes
   deduped and sorted.
2. `npm run status:live` against the live database — antigravity (1/5 down, reset in the
   future) reads `IDLE`, codebuddy reads `THINKING`/`IDLE`, and no row reads `FALLBACK`. Both
   print their failure text as `(partial: still serving, no bubble)`: the reporter still formats
   it for diagnosis, but the office shows nothing because neither provider is all-down.
3. `tsc --noEmit` — 0 errors. This is the real guard that `FALLBACK` is gone everywhere.
4. `eslint` — 0 errors, in particular no unused `Users` / `spring` imports.
5. `next build` — 0 errors.
6. `npm run smoke` — 0 page errors, 0 console errors, `canvasNonBlank: true`,
   `contextLost: false`, four states reachable, bubble text present after `ERROR`.
7. **Manual pointer check** (the failure mode §8 describes): click `✕` and confirm no desk
   gets selected, no camera flight starts; then drag starting on the bubble and confirm the
   camera does not orbit, while dragging on empty canvas still does.
8. `npm run perf` — idle stays at 10 FPS, active at ~28 FPS. The bubble adds DOM only when
   an error exists and adds no frame work.
9. Screenshot with a real error (CodeBuddy) showing the bubble above the pill, and one
   with everything healthy showing no visual change to the default view.
