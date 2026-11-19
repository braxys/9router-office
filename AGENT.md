# Project Context: 9Router 3D Spatial Agent HUD — "Fun & Colorful Blocky Office"

## 1. Project Overview
We are building a **3D Spatial Observability & Telemetry HUD** that visualises real-time AI model
routing and usage from a local **9Router** instance. Instead of static charts, each AI
provider/model configured in 9Router is represented as a **blocky worker robot** sitting at its
own colourful desk inside a bright, toy-like isometric office diorama.

The visual language is deliberately **playful, warm and cartoonish** — closer to *Crossy Road* or
*Overcooked* than to a sci-fi command centre. The office is a daylight diorama: warm oak floors,
cream walls, big windows onto a pastel-blue sky, a rainbow rug, and a cheerful central server desk
that the robots send parcels to.

## 2. Core Objectives
- **Real-time Telemetry:** Read 9Router's local usage data (SQLite via `/api/telemetry`) and poll
  it into the client store, with Simulation Mode as an automatic fallback when 9Router is offline.
- **Visual State Mapping:** Translate LLM lifecycle events (`IDLE`, `THINKING`, `STREAMING`,
  `ERROR`) into comedic, readable robot performances — chair sways, super-fast typing, parcel
  launches and cartoon smoke — and surface a provider's failure as a dismissible error bubble
  above its desk.
- **Zero-Cost & Local-First:** Must run 100% locally without paid external APIs or heavy cloud
  dependencies.

## 3. Character Design: Fun Blocky Worker Robots
- **MVP Approach (Procedural):** Assemble each robot from chunky `BoxGeometry` blocks — no imported
  models, no rigging, no external assets.
- **Head:** a retro-monitor cube with a lighter face plate, a pair of **big expressive square eyes**
  (with a white glint), a simple LED mouth bar, pink cheek blush, ear bolts, and a springy
  antenna topped with a ball that wobbles with the head's motion.
- **Body:** a boxy chest with a lighter belly plate, a red **bow tie**, and a small **name badge**.
- **Arms:** boxy upper arms with cream block hands that bounce and jitter as they type.
- **Legs:** seated thighs tucked under the desk, shins dropping to the floor, and cream block feet
  resting flat — so the robot reads as *sitting on the chair*, never floating.
- **Per-provider body colour:** each bot wears a four-role brand palette — `body` (cranium and
  chest), `limb` (upper arms and thighs), `accent` (bow tie, badge stripe, crest, topper, emblem)
  and `extra` (shins) — so a bot reads multi-colour rather than one flat hue. The colours are taken
  from each provider's own logo; the full per-provider table lives in `src/lib/providerIdentity.ts`.
  Unknown providers keep the hash-derived runtime colour.

## 4. Environment: The Blocky Office Diorama
- **Lighting:** bright warm daylight — a warm sun directional light, a bright
  ambient + hemisphere fill, and a cool fill from the open side of the diorama. No bloom, no neon,
  no real-time shadows (replaced with cheap blob shadows for iGPU friendliness).
  Tone mapping is `NeutralToneMapping` (ACES desaturated the pastels).
- **Room:** warm oak plank floor, a concentric rainbow rug at the centre, cream walls with large
  windows (pastel-blue sky, sun and drifting clouds), a wall clock with tick marks, a whiteboard
  covered in colourful scribbles, an open bookshelf of colourful books, a water cooler, and blocky
  cactus / monstera plants. The wall nearest the camera is omitted (diorama cutaway).
- **Desks:** per agent — warm wood top, white drawer pedestal, retro-modern monitor with a glowing
  status screen, a chunky keyboard, a coffee mug with drifting steam, a stack of papers, and a
  colourful swivel chair.
- **9ROUTER CORE:** a cheerful central server desk / pneumatic-tube hub — white cabinet, server
  stack with pastel indicator lamps (one per agent, coloured by status), a pulsing beacon, four
  little tubes, a wobbling antenna, and an orbiting carousel of colourful parcels.

## 5. UI / HUD Direction
- Clean, friendly cards — **not** dark sci-fi panels. Rounded corners, warm white/cream surfaces,
  soft slate ink, and bright candy accents.
- Typography is rounded and relaxed: **Nunito** for UI text and **Fredoka** for display.
- Bottom **Simulation Mode** dock with chunky "sticker" buttons for each manual status, a
  broadcast toggle, a robot picker, camera preset buttons (overview / hub / focus), and keyboard
  shortcuts `1`–`4`.
- Floating cards for identity, office vitals (TPS, tokens, working count, FPS), a robot spotlight
  with an effort meter, and a mood-change log.
- Each desk carries a floating name + status pill in the 3D scene, at a constant on-screen size
  so it reads in both the overview and a focus shot. When a provider has no usable account left,
  a dismissible red chat bubble stacks above that pill with the failure text and its reset date.
- Two small display toggles sit beside the camera presets: **sound** (muted by default) and
  **model** (procedural robot ↔ `.glb`). The model toggle turns red with an alert icon when a
  model file fails to load, and its tooltip explains what happened.
- Interface sounds are synthesised Web Audio blips, not sample files: a dry click for status
  triggers, a two-note blip for toggles, a rising arpeggio for Reset.

## 6. Constraints & Ground Rules
- **The Zustand store (`src/store/useAgentStore.ts`) is the source of truth.** Simulation
  behaviour must not change; the only sanctioned extension is the additive
  `applyLiveTelemetry(agents)` action used by the telemetry bridge.
- **Presentation state lives in `src/store/useUiStore.ts`, never in `useAgentStore`.** Sound and
  model preferences must not look like telemetry updates. That store always starts at the
  defaults and applies `localStorage` after mount, so nothing reads storage during render.
- **Simulation Mode must keep working exactly as before:** manual status triggers, broadcast to
  all, cycle, reset, and the automatic mock telemetry tick.
- **Mode ownership:** manual triggers and `Reset` claim Simulation Mode first, and
  `applyLiveTelemetry` no-ops while it is on, so a 1.5 s poll can never erase a live demo. Only an
  outage-initiated pause auto-resumes on reconnect.
- Rendering must stay smooth on integrated GPUs (iGPU) in thin laptops; dynamic FPS throttle
  keeps frame rate at 30 FPS when all idle and ~28–30 FPS when active or on a camera flight, and pauses
  entirely when the tab is hidden.
- **In-canvas store subscriptions must be value-compared** (`useShallow` or primitive selectors).
  Any re-render inside `<Canvas>` invalidates the demand loop, so subscribing to the raw `agents`
  array adds a frame per telemetry tick.
- Everything is procedural and local — no external 3D assets, no paid services. The one generated
  asset (`public/models/worker-robot.glb`) is built from `src/lib/robotModel.ts` by
  `npm run build:model`, so it is reproducible and still fully local.
- **The procedural robot stays the default.** The `.glb` body is opt-in through `?model=` or the
  HUD toggle; with neither set, the office must look exactly as it did before.
- **Shape lives in the file, animation lives in code.** Never bake per-status animation into the
  `.glb`; `ModelRobot.tsx` drives the same node channels with the same springs as `WorkerRobot.tsx`,
  and `RobotEffects.tsx` provides the status props for both bodies.
- **Do not load models with `useGLTF`.** It suspends by throwing and rethrows the rejection during
  render, and React 19 reports every caught render error to `window` — a missing file would fail the
  zero-page-error gate even with an error boundary. `ModelRobot.tsx` loads imperatively instead.
- **Audio must stay dormant while muted:** no `AudioContext` until the user opts in with a click.
- `Math.random()` must never run during render (React 19 `react-hooks/purity`); use the seeded
  LCG in `src/lib/random.ts` instead.
- **Provider status rules live in `src/lib/statusResolution.ts`, not in `routerAdapter.ts`.** Keep
  them pure (no `node:` imports, no I/O) so `npm run status:test` can import and execute the
  shipping code instead of a copy. Any change to `resolveStatus` / `summariseConnections` /
  `describeError` needs a case in `scripts/status-rules.mjs`; the script fails the build on a
  mismatch.
- **Traffic outranks connection flags.** `usageHistory` rows are only written after a successful
  request, so fresh traffic is proof the provider works and must win over `testStatus:
  'unavailable'`. Ranking flags first made a 2/3-healthy provider look degraded mid-stream.
  Do not "fix" this by moving the flag checks back up.
- **`ERROR` means "nothing left to serve", not "something is wrong".** It is reported only when
  every usable account for a provider is `unavailable`. A provider with 1 of 3 accounts dead is
  still serving, so it keeps reporting `IDLE` / `THINKING` / `STREAMING` and shows no bubble;
  partial degradation is deliberately silent. This was the user's explicit ruling: a status that
  says "degraded" reads as "broken" and recreates the lie the fifth status used to tell.
- **The error bubble's text is built once, on the server, from an absolute instant.** It comes
  from `providerConnections.data.lastError` plus `lastErrorAt + parseResetMs(...)`, formatted
  through a fixed English month table in UTC — never `toLocaleString`, which would depend on the
  server's locale, and never a reprinted countdown, because the provider writes
  `Resets in 167h57m31s` exactly once and a recomputed countdown would freeze into a lie. A
  reset instant already in the past is dropped instead of shown as stale.
- **Never derive flag age from `providerConnections.updatedAt`.** It also moves on token refresh
  (a row flagged at 01:50 carried `updatedAt: 07:10`), so it says nothing about when the failure
  happened. The flag is honoured until 9Router clears it; `rateLimitedUntil` is `null` on every
  live row and cannot be used as an expiry either.
- **Paused accounts (`isActive = 0`) are not part of provider health.** 9Router never routes to
  them, so they must not count toward `total` or `down`.

## 7. Phase Plan
- **Phase 1 (done):** spatial command centre scaffold, store, simulation mode, telemetry HUD.
- **Phase 1.5 (done):** full visual redesign to the Fun & Colorful Blocky Office.
- **Phase 1.75 (done):** iGPU performance pass — no real-time shadows, demand-driven render loop
  with a 30/28 FPS throttle, tab-hidden pause, allocation-free `useFrame` callbacks.
- **Phase 2 (done):** live 9Router telemetry from the local SQLite database via
  `/api/telemetry` + `TelemetryBridge`, with automatic Simulation Mode fallback.
- **Phase 3 (done):** TPS-driven parcel volume, floating 3D name/status badges, and smooth camera
  presets (overview / hub / focus) driven by `src/lib/cameraBus.ts`.
- **Phase 4 (done):** subtle synthesised Web Audio UI clicks (muted by default) and an optional
  `.glb` robot body (`?model=` or the HUD toggle) with a generated, reproducible model and a
  procedural fallback that never throws. Default view unchanged; idle runs at 30 FPS.
- **Phase 4.5 (done):** status-rule correction. Traffic now outranks connection flags, so a
  provider with a healthy account still streaming reports `STREAMING`/`THINKING` instead of a
  degraded label; paused accounts are excluded from health. Rules extracted to
  `src/lib/statusResolution.ts` and covered by `npm run status:test`.
- **Phase 4.6 (done):** four-status model and the error bubble. `AgentStatus` is exactly
  `IDLE | THINKING | STREAMING | ERROR` — the degraded `FALLBACK` status is gone, and `ERROR` is
  reserved for a provider with zero usable accounts. `describeError` was rebuilt to name the
  cause (`Sign-in failed` / `Quota exhausted` / `Rate limited` / `Upstream unavailable`), the
  codes, and an absolute reset date. A dismissible bubble stacks above the desk's name pill —
  only in the same all-accounts-dead case as `ERROR`, never for a partial outage — keyed by the
  error text so it returns when the message changes and stays closed otherwise.
  Dismissals live in `useUiStore`, never in the telemetry store, and are never persisted.
