# System Architecture & Telemetry Pipeline

## 1. High-Level Data Flow
```text
[Client / IDE] ---> [9Router Local Proxy] ---> [Upstream LLM Providers]
                            │
                            ▼ (usageHistory / usageDaily / providerConnections)
                [Next.js route handler: GET /api/telemetry]
                            │  read-only SQLite via node:sqlite
                            ▼ (normalised JSON, polled every 1.5 s)
                [TelemetryBridge] ──► [Zustand Store (Transient State)]
                            │
          ┌─────────────────┴─────────────────┐
          ▼                                   ▼
[R3F Blocky Office Diorama]        [2D Playful HUD Overlay]
(Worker robots, per-state comedy)  (Cards: TPS, latency, moods)
```
When 9Router is unreachable the bridge turns Simulation Mode back on, so the office keeps
performing from the local mock telemetry instead of going dark.

## 2. Worker Robot State & Animation Matrix
Each live provider reported by 9Router (top four by 24-hour request count) maps to a blocky worker
robot seated at its own colourful desk. In Simulation Mode the roster falls back to
`AGENT_CONFIGS`. Each status drives a distinct comedic performance, all computed in `useFrame`
against refs — never React state.

| Status | Body / Chair | Face & Head | Desk / Particle FX |
| :--- | :--- | :--- | :--- |
| **`IDLE`** | Relaxed sway left-right on the swivel chair, gentle breathing bob, occasional happy nod. | Big square eyes with slow blinks; head drifts around the room and periodically glances at the coffee mug. | Steady screen glow, coffee steam rising. Antenna sways gently. |
| **`THINKING`** | Eager forward lean into the desk, torso pitched toward the monitor, chair bouncing lightly. | Eyes squint in concentration, head tilted down at the screen, rapid antenna wobble. | Hands hammer the keyboard at high frequency (keyboard jitters); a bouncing yellow **lightbulb** with rays pops above the head. |
| **`STREAMING`** | Leans forward, right arm raised toward the hub, body tracking the launch arc. | Wide awake eyes, small excited mouth, quick antenna wiggle. | Types while launching colourful **cube parcels** along an arc to the 9ROUTER CORE, trailing star/confetti sparkles. |
| **`ERROR`** | Startled repeated hops in the chair, whole body jolted upright. | Head tilted **45°**, eyes become red **X X**, antenna flails wildly, mouth opens in a small "oh". | Cartoon grey **smoke puffs** rise and fade off the monitor; the screen strobes red. |

`ERROR` is reserved for a provider with **zero usable accounts** — nothing left to serve. Partial
degradation is not a status: a provider with 1 of 3 accounts flagged keeps reporting `IDLE`,
`THINKING` or `STREAMING`, because it is still doing work. It shows **nothing at all** — no status
change and no bubble. The dismissible **error bubble** above the desk's name pill is reserved for
the same all-accounts-dead condition as `ERROR`; it is not a partial-outage reporter. A status that
says "degraded" reads to a human as "broken", which is exactly the misreading that retired the
fifth status, and a bubble on a provider that is answering requests would recreate it in a new
place.

### Shared character rig
- Assembled entirely from `BoxGeometry` blocks plus a few `CylinderGeometry` bolts/antenna and a
  `SphereGeometry` antenna ball. No imported models, no skeletal animation.
- Animation channels (`lean`, `tilt`, `hop`, `armLiftL/R`) are spring-smoothed in a `useRef` bag so
  status changes blend instead of snapping.

### Per-provider identity

Every known provider gets a **silhouette**, not just a colour swap. Three shape tables in
`src/lib/robotModel.ts` — `SHELLS` (head crest), `TOPPERS` (antenna topper) and `EMBLEMS` (chest
badge) — are keyed by `IdentityId`. `src/lib/providerIdentity.ts` maps a provider key to a
`ResolvedIdentity` (`id`, `color`, optional `accent2`, `shell`, `topper`, `emblem`) and is the only
place provider strings are matched; the resolved identity travels on telemetry
(`AgentTelemetry.identity`) so no component has to look a provider up at render time.

A provider whose logo the project does not know resolves to `default`: the shared body, the yellow
antenna ball, and a stable hash-derived colour (`UNKNOWN_PROVIDER_COLORS`). Adding a provider is a
data edit — one entry in the identity table plus any new shape rows — with no change to the rig.

Both bodies read the same tables. The procedural rig renders `RobotParts` (shared body) plus
`RobotIdentityParts` (identity only); the `.glb` path already carries the baked shared body, so it
mounts **only** `RobotIdentityParts`, portal-ed onto the model's own `head` / `torso` / `antenna`
joints — a shell has to follow the head when it looks around and tilts on `ERROR`. `<AntennaTopper>`
is the single owner of whatever sits on the antenna: it renders the provider's topper, or the same
yellow ball for a `ball` identity, so the baked `antennaBall` mesh is always hidden. The topper's
pulse lives in a wrapper group so every identity keeps the ball's old "alive" feel.

Identity geometry is bounded by three exported envelopes (`SHELL_ENVELOPE`, `TOPPER_ENVELOPE`,
`EMBLEM_ENVELOPE`) unioned into `ROBOT_ENVELOPE_TOP` / `ROBOT_ENVELOPE_HEIGHT`. Those drive the name
pill anchor; `ROBOT_HEIGHT` (2.365 m) stays the body height that the `.glb` build asserts. A topper
that grows therefore lifts the pill on its own instead of growing into it.

## 3. Scene Composition
```text
Scene (Canvas, NeutralToneMapping, dpr=1, antialias=false, frameloop="demand")
├── PerformanceManager  (invalidates a throttled rAF loop: 30 FPS idle / ~28 FPS active / paused when tab hidden)
├── daylight rig  (ambient + hemisphere + warm sun + 2 fills, no shadows)
├── BlobShadow ×5  (cheap dark circles under each desk + central hub)
├── OfficeRoom
│   ├── WoodFloor      contiguous staggered oak planks + solid sub-floor
│   ├── Rug            concentric rainbow bands under the hub
│   ├── Window ×3      pastel sky, sun disc, drifting clouds, mullions, sill
│   ├── WallClock      ticking hands, tick marks, pink rim
│   ├── Whiteboard     frame + 26 seeded colourful scribbles + marker tray
│   ├── Bookshelf      open carcass w/ shelf boards + seeded book rows
│   ├── WaterCooler    bottle bobbing, blue taps
│   └── Cactus / Monstera  blocky plants
├── CentralHub (9ROUTER CORE)
│   ├── cabinet + desk top + drawer faces
│   ├── server stack w/ per-agent indicator LEDs coloured by status
│   ├── pneumatic tube bends (quarter tori) + pulsing beacon
│   ├── springy antenna + orbiting parcel carousel
│   └── Billboard label ("9ROUTER CORE", n/m ROBOTS WORKING) at y = 5.0
├── AgentNode ×4  (WorkDesk + WorkerRobot + <Html> name/status pill, click to select)
└── CameraRig     intro dolly → OrbitControls, plus overview / hub / focus presets
```

The name pill's anchor is derived, not hardcoded: `PILL_Y = DESK_SEAT.y + ROBOT_ENVELOPE_TOP +
TOPPER_ANIMATION_LIFT + 0.1`, and its depth is `PILL_Z = DESK_SEAT.z` — the antenna's plane, not the
group origin. Both details are load-bearing. `<Html center>` centres the element on the anchor, which
drops half the pill (27 px ≈ 0.19 m here) back over the topper; the wrapper is instead shifted by its
own height so the pill's bottom edge sits on the anchor. And because the desks sit ~0.48 m behind the
group origin while the camera looks down from the front, a pill at the origin projects *lower* on
screen than the topper it should float above — close enough to cover it. `TOPPER_ANIMATION_LIFT`
(0.05 m) covers the idle head bob and antenna wobble, which lift a tall topper ~0.047 m above its
rest-pose envelope.

`SceneBridge` (only mounted under `?capture=1`) publishes `window.__office` — scene, camera and a
`robots` getter over a registry of mounted desk groups — so `identity-render.mjs` can walk the live
graph. It is a getter rather than a snapshot because the gate polls it and a snapshot would go stale
as soon as a desk mounts or the roster ticks.

### Camera presets
`src/lib/cameraBus.ts` is a DOM-level pub/sub so the HUD can ask the canvas to fly somewhere
without putting presentation state in the telemetry store:

```text
ControlDock ──requestCamera('overview' | 'hub' | 'focus')──► cameraBus ──► CameraRig
```

`CameraRig` interpolates **position and look-target together** with a 0.9 s smoothstep. Fixed
poses are module-level `Vector3` constants; the flight loop only copies them, so nothing is
allocated per frame. While a flight runs it disables `OrbitControls` and orients the camera with
`camera.lookAt()` — drei's `OrbitControls` calls `update()` every frame, and each `change` it emits
runs `invalidate()`, which would pin the demand loop at the display refresh rate. A single
`update()` at the end resyncs the orbit maths. `isCameraAnimating()` is read by
`PerformanceManager` so a flight gets the active budget even when every robot is IDLE.

The `focus` pose is computed from the selected agent's slot (`AGENT_SLOTS[index]`), placed in
front of the desk just beyond `minDistance`.

### Desk ↔ robot alignment
`WorkDesk.tsx` exports a single `DESK_SEAT` constant (`x`, `y`, `z`, `surfaceY`). Both the chair
group and the robot's root read it, so the robot's hips always land on the seat and its hands land
on the desk surface. The robot has seated thighs, shins and block feet that reach the floor — this
is what stops it reading as "floating".

## 4. Directory Structure
```text
src/
├── app/
│   ├── api/
│   │   └── telemetry/
│   │       └── route.ts     GET /api/telemetry — live 9Router snapshot
│   ├── globals.css          toy design tokens + .toy-* utilities
│   ├── layout.tsx           Nunito + Fredoka fonts, light theme metadata
│   └── page.tsx
├── components/
│   ├── CommandCenter.tsx    client shell, dynamic(ssr:false) canvas, HUD mount
│   ├── canvas/
│   │   ├── Scene.tsx        canvas, daylight rig, badges, CameraRig presets, AgentNode wiring
│   │   ├── OfficeRoom.tsx   floor, rug, walls, windows, props, plants
│   │   ├── WorkDesk.tsx     desk, monitor, keyboard, mug, papers, chair, DESK_SEAT
│   │   ├── WorkerRobot.tsx  procedural robot rig (the default body)
│   │   ├── RobotParts.tsx   part-spec renderer + identity-only variant + AntennaTopper
│   │   ├── ModelRobot.tsx   opt-in `.glb` body: imperative loader, clone tinting, same animation
│   │   ├── RobotEffects.tsx per-status comedy FX shared by both bodies
│   │   └── CentralHub.tsx   9ROUTER CORE server desk / tube hub
│   └── hud/
│       ├── ControlDock.tsx     Simulation Mode triggers, broadcast, robot picker, camera presets
│       ├── SoundToggle.tsx     mute/unmute for the toy UI clicks
│       ├── ModelToggle.tsx     procedural robot ↔ `.glb` body, plus the load-error state
│       ├── TelemetryBridge.tsx 1.5 s poller + Simulation Mode fallback
│       └── TacticalOverlay.tsx identity, vitals, spotlight, mood log
├── lib/
│   ├── agents.ts            AGENT_CONFIGS, SLOT_POSITIONS, STATUS_META, MANUAL_STATUSES
│   ├── audio.ts             synthesised UI voices, mute- and gesture-gated
│   ├── cameraBus.ts         camera-preset pub/sub + isCameraAnimating() flag
│   ├── format.ts            number/time/colour helpers
│   ├── modelChoice.ts       `?model=` resolution + hydration-safe readers
│   ├── providerIdentity.ts  provider key → ResolvedIdentity (colour, shell, topper, emblem)
│   ├── random.ts            seeded LCG (no Math.random during render)
│   ├── renderStats.ts       render-frame counter shared with the HUD FPS meter
│   ├── robotModel.ts        single source of truth for the robot's shape, identity tables and palette
│   ├── routerAdapter.ts     9Router SQLite reader + status/metric normaliser
│   ├── statusResolution.ts  provider status rules (traffic vs. account flags)
│   └── types.ts             AgentStatus, AgentTelemetry, AgentConfig
└── store/
    ├── useAgentStore.ts     Zustand store — roster + selection + simulation state
    └── useUiStore.ts        presentation prefs (sound, model) + dismissed errors — never telemetry
```

Generated assets and tooling:
```text
public/models/worker-robot.glb       generated model (72 488 bytes, 30 parts, 2.365 m)
public/models/worker-robot.meta.json build manifest (part count, bounds, tintable meshes)
scripts/build-robot-model.mjs        `npm run build:model` — writes both files from robotModel.ts
scripts/identity-rules.mjs           `npm run identity:test` — truth table for providerIdentity.ts
scripts/identity-render.mjs          live-graph gate: shells, toppers, baked ball, pill clearance
scripts/status-rules.mjs             `npm run status:test` — truth table for statusResolution.ts
scripts/explain-status.mjs           `npm run status:live` — shipping rules vs. the live database
```

## 5. State Management
- **`useAgentStore`** owns `agents[]`, `selectedAgentId`, `simulationMode`, `transitions[]` and
  `eventCounter`, plus the actions `selectAgent`, `setSimulationMode`, `setStatus`,
  `setAllStatuses`, `cycleAll`, `resetTelemetry`, `tick` and `applyLiveTelemetry`.
- **Live telemetry:** `TelemetryBridge` (mounted once by `CommandCenter`) polls `/api/telemetry`
  every 1.5 s while the tab is visible and calls `applyLiveTelemetry(agents)`, which swaps the
  roster without touching the simulation actions. The first successful poll turns Simulation Mode
  off; a failed poll turns it back on.
- **Mode ownership (live vs. simulation):** `applyLiveTelemetry` is a no-op while
  `simulationMode` is on, so a poll can never overwrite a manual demo. Manual triggers and
  `Reset` in `ControlDock` switch simulation on *before* touching the roster. The bridge tracks an
  `autoPaused` flag so only an outage-initiated pause is auto-resumed on reconnect; a
  user-chosen Simulation Mode stays until the user leaves it. The identity card reads
  `Live feed` (green) or `Sim feed` (orange).
- **Simulation Mode:** a `<SimulationClock>` inside the Canvas calls `tick(performance.now())`
  every 500 ms (measured on rendered frames). When `simulationMode` is on, `tick` mutates
  token/latency figures and occasionally rolls a new status per agent, recording a
  `TransitionEntry`. When off, it is a no-op and the office shows live values.
- **Manual triggers** in `ControlDock` call `setStatus` (single robot) or `setAllStatuses`
  (broadcast) with `source: 'manual'`, and are also bound to keys `1`–`4`.
- **Reading state in 3D:** each `AgentNode` subscribes with narrow primitive selectors
  (`s.agents.find(...)?.status`, `.name`, `.accentColor`, `.tokensPerSecond`, `.lastError`) so a
  status change only re-renders that one desk. All per-frame animation reads refs and mutates
  matrices directly, keeping React out of the render loop.
- **Value-compared subscriptions:** `World` uses `useShallow` over the id / status / colour lists
  rather than subscribing to `state.agents`. Every telemetry tick builds a fresh roster array even
  when nothing visible changed, and any re-render inside `<Canvas>` calls `invalidate()` — that
  silently added ~2 frames/s to the idle budget (10 → 12 FPS) until the subscriptions were
  compared by value.
- **`useUiStore`** holds presentation-only preferences — `soundEnabled`, `useModel`, `modelError` —
  and is deliberately separate from `useAgentStore`: a preference change must never look like a
  telemetry update. It always *starts* at the defaults and applies `localStorage` from an effect
  (`hydrate()`), because reading storage during render would mismatch on hydration.
- **`dismissedErrors`** lives in `useUiStore` as `agentId -> the exact error text the user closed`.
  It is keyed by the *text*, not a timestamp: the bubble returns by itself when the message
  changes, and the reset hint is an absolute date rather than a countdown, so the text does not
  drift on its own. It is session-only and never written to `localStorage` — a dismissal from
  yesterday must not silence today's failure — and it is deliberately not in `useAgentStore`,
  because closing a bubble is not telemetry.
- **A dismissal expires when the failure does.** Text alone is not a safe key: live codebuddy's
  message has no reset duration, so it formats to the same string every time. Dismiss it once and
  a later, genuinely new failure would stay hidden for the session. `AgentNode` therefore calls
  `clearDismissedError(id)` whenever `lastError` empties — a dismissal outlives the failure it
  dismissed, never the provider. Re-pressing `ERROR` while already in `ERROR` also re-stamps
  instead of no-oping, so a dismissed simulation bubble can always be summoned again.
- **`?model=`** (`src/lib/modelChoice.ts`) wins over the stored preference and pins the choice:
  `on` / `1` / empty → the bundled model, `off` / `0` → procedural, a `/path` or `http(s)://` URL →
  that file. Anything else is ignored with a single warning and the parameter is treated as absent.
  It is read through `useSyncExternalStore` (server snapshot `null`) so the URL never causes a
  hydration mismatch.
- **The error bubble needs a native pointer guard, and it needs a callback ref.** drei's `<Html>`
  appends its portal to `events.connected` — the same element R3F and `OrbitControls` listen on —
  and both read `offsetX/offsetY` instead of `event.target`. So without a guard, clicking `✕` also
  selects the desk and dragging the bubble orbits the camera. Two consequences:
  1. The guard must be attached from a **callback ref**, not a `useEffect` keyed on visibility.
     drei renders the `<Html>` children into its *own* React root, so when `AgentNode`'s effect runs
     the bubble is not attached yet and `ref.current` is still `null`; the effect then never runs
     again, silently leaving the guard off.
  2. The dismissal cannot be a React `onClick`. The guard stops the click at the bubble, which sits
     *below* the React root drei created for the portal, so the delegated handler never fires. It is
     handled natively inside the same guard via a `data-error-dismiss` attribute. The control stays
     a real `<button>`, so Enter and Space still produce a click and keyboard dismissal works.

## 5b. Optional `.glb` Body
- **Default unchanged.** With no `?model=` and no stored preference, `Scene` renders
  `WorkerRobot` exactly as before; `ModelRobot` is a `next/dynamic` chunk, so `GLTFLoader` is not
  in the initial bundle.
- **Shape in the file, animation in code.** `src/lib/robotModel.ts` is the single source of truth
  for parts, node names and palette; `scripts/build-robot-model.mjs` builds the `.glb` from it and
  `WorkerRobot.tsx` builds the procedural rig from it. The file stores geometry only — the
  `torso`/`head`/`antenna`/`armL`/`armR` nodes are named from `ROBOT_NODES` and animated in code,
  so both bodies share one performance.
- **Seating.** The clone is scaled to `ROBOT_HEIGHT` and placed inside a group already at
  `DESK_SEAT`, offset by `-DESK_SEAT.y - bounds.min.y * scale` so its feet land on the floor.
  `DESK_SEAT` is applied exactly once (the first build applied it twice and floated).
- **Per-agent colour.** `SkeletonUtils.clone` shares materials, so each clone's materials are
  cloned before tinting `body` / `limb`; otherwise all four desks turn the same colour.
- **Loading is imperative, not Suspense.** `useGLTF` suspends by throwing and then rethrows the
  rejection during render, and React 19 reports *every* caught render error to `window`, so a
  missing file could never pass a zero-page-error gate even with a boundary. `ModelRobot` calls
  `GLTFLoader.load` inside an effect with one promise per URL: a failure becomes state, logs one
  warning, sets `useUiStore.modelError`, and renders the procedural robot. `RobotEffects` renders
  in both paths, so opting into a model never deletes the bulb, smoke or parcels.
- **Identity is portal-ed on, not baked.** The file stores the neutral shared body, so the provider
  shell, topper and emblem are mounted with `createPortal` onto the clone's own `head` / `torso` /
  `antenna` joints. That is what makes a crest follow the head when it looks around and tilts 45° on
  `ERROR`, and what lets the antenna wobble carry the topper with it. Two details worth keeping:
  `RobotIdentityParts` is used rather than `RobotParts`, because the clone already contains the baked
  shared body and mounting it again would double every block; and the baked `antennaBall` is hidden
  **unconditionally**, because `<AntennaTopper>` owns that case too and renders the ball itself —
  gating the hide on "a topper replaces it" left `default`/unknown providers with two identical
  spheres z-fighting at the same position. The joints are looked up in a `useMemo` (the portals
  need them during render) while the frame loop reads them through a ref — `react-hooks/purity`
  forbids mutating a render-scoped value after render.

## 6. Live Telemetry Pipeline (9Router)
- **Why SQLite:** 9Router's `/api/usage/*` routes are JWT/cookie protected (401 without a
  dashboard session). The local database is plain `sqlite`, already in WAL mode, and needs no
  credentials.
- **Read path:** `src/lib/routerAdapter.ts` opens
  `%APPDATA%/9router/db/data.sqlite` read-only through
  `process.getBuiltinModule('node:sqlite')` (macOS and Linux fallbacks included; override with
  `NINEROUTER_DB_PATH`). Results are cached for 800 ms so concurrent polls share one query set.
- **Queries:** top four providers by 24-hour `usageHistory` count (all-time fallback when the
  window is empty), recent rows for tokens/second and latency proxy, today's `usageDaily` rollup
  for token totals, and `providerConnections` for health.
- **Status mapping** (implemented in `src/lib/statusResolution.ts`, tested by `npm run status:test`):
  no traffic in the window → `IDLE`; last request < 4 s → `STREAMING`; < 25 s → `THINKING`;
  every *usable* connection `unavailable` → `ERROR`; otherwise `IDLE`. There is no fifth status.
- **Why traffic outranks the flags:** `usageHistory` is written only after a request succeeded, so
  a 1-second-old row proves the provider is serving. `providerConnections` describes the accounts
  9Router is *not* using. Ranking the flags first made a provider with 2/3 healthy accounts look
  degraded while it was mid-stream. Flags now decide only once the provider goes quiet.
- **`ERROR` requires zero usable accounts.** A partial outage keeps the provider on its real
  activity status and shows no bubble either — `routerAdapter` only sets `lastError` when
  `down === total && total > 0`. This keeps the label honest — "this provider cannot serve" —
  instead of a gradient the user has to interpret, and it keeps the bubble meaning the same thing
  as the status it accompanies.
- **Paused accounts are excluded** from the health counts (`isActive = 0`): 9Router never selects
  them, so counting one would let a paused-but-broken account drag a healthy provider down.
- **No time-based expiry on the flag.** Investigated against the live DB and rejected: `updatedAt`
  is *not* the flag write time (it also moves on token refresh — an account flagged at 01:50 carried
  `updatedAt: 07:10` from a refresh), `lastErrorAt` is honest but an exhausted quota stays exhausted
  for days (observed "Resets in 167h57m"), and `rateLimitedUntil` — the one field where 9Router
  declares its own expiry — is `null` on every live row. The flag is taken at face value until
  9Router clears it on its own retry schedule.
- **Metrics:** `tokensPerSecond` = completion tokens over the last 30 s; `latencyMs` = median gap
  between recent completed requests (the schema has no latency column); `totalTokensToday` comes
  from the daily rollup.
- **Failure mode:** the route answers `200 { connected: false }` when the database is missing or
  unreadable, so the bridge can fall back to Simulation Mode without a console error.

## 7. Performance Notes
- Target: smooth on integrated GPUs (iGPU) in thin laptops.
- `dpr={1}`, `antialias: false`, `powerPreference: 'low-power'` — minimal GPU load.- `frameloop="demand"` with a custom `PerformanceManager` that calls `invalidate()` from a
  throttled `requestAnimationFrame` loop: **30 FPS** when all agents are IDLE, **~28 FPS** when any
  agent is active (THINKING / STREAMING / ERROR) or while a camera preset is flying, and
  **paused** when the browser tab is hidden. The loop carries an accumulator with half a refresh of
  slack, because rAF ticks land on display boundaries: without that cushion a 35.7 ms budget rounds
  up to 3 ticks on a 60 Hz panel (≈19 FPS) instead of 2 (≈29 FPS).
- Every render inside `<Canvas>` invalidates the loop, so in-canvas subscriptions must be compared
  by value (see §5). Two telemetry ticks per second would otherwise add two frames per second.
- The HUD FPS figure reads `src/lib/renderStats.ts`, which the canvas bumps once per rendered
  frame, so it reports real draw rate instead of the browser's 60 Hz rAF rate.
- `?capture=1` turns on `preserveDrawingBuffer` for the screenshot harness; normal play keeps the
  cheaper default. Without it, a demand-loop canvas reads back black after the frame is presented.
- No real-time shadows — `castShadow` / `receiveShadow` removed from all meshes; replaced with
  flat `BlobShadow` circles (`meshBasicMaterial`, dark transparent) under each desk and the
  central hub.
- No `new THREE.*` allocations inside any `useFrame` callback (GC-pressure-free render loop).
- Materials are `MeshLambertMaterial` / `MeshBasicMaterial` — no PBR cost, and the flat look suits
  the toy diorama.
- Deterministic decorative scatter (floor shades, scribbles, books, parcels) uses
  `createSeededRandom` in `useMemo`, satisfying React 19's `react-hooks/purity` rule.
- **Measured after Phase 4:** all-idle **30 FPS** (idle budget raised from 10), and **30 FPS** with the `.glb` body on and an
  active agent (budget ~28). The model path costs about the same as the procedural rig: the file is
  one 72 KB binary with shared geometry, and animation is the same handful of node rotations.
- **Audio costs nothing when unused.** `src/lib/audio.ts` returns before touching the Web Audio API
  while muted, so no `AudioContext` is constructed for anyone who never enables sound. Voices are a
  single oscillator plus a gain envelope, disconnected on `ended`.

## 7b. Interface Sound
- Synthesised, not sampled: `playClick` (dry square blip), `playToggle` (two-note triangle),
  `playConfirm` (rising three-note arpeggio for Reset). No audio files ship with the project.
- **Muted by default** and gesture-gated: the context is only created from a click or key handler,
  which avoids the browser autoplay warning entirely.
- **Opt-in is audible immediately** — the toggle plays its own blip after enabling, so the user
  hears what they switched on. `prefers-reduced-motion` is treated as "keep the extra sensory stuff
  down" and silences the voices.
- `isAudioContextCreated()` is a test hook, used to prove audio stays dormant while muted.

## 8. Verification Harness
```text
scripts/smoke.mjs   page-ready probe, screenshot, console/page error + failed-request capture
scripts/perf.mjs    rendered-FPS sampler (counts gl.clear); --idle forces the 30 FPS state
scripts/shot.mjs    navigates with ?capture=1 and captures a full or clipped screenshot
scripts/probe.mjs   DOM/GL introspection
scripts/build-robot-model.mjs  regenerates public/models/worker-robot.glb (+ meta) from robotModel.ts
scripts/identity-rules.mjs     truth table for providerIdentity.ts (npm run identity:test)
scripts/identity-render.mjs    live-graph render gate for the per-provider identity (26 assertions)
```

`identity-render.mjs` answers a question a screenshot cannot: *is a shell authored in the part
tables actually mounted on the live three.js graph?* A colour swap looks identical in a PNG. It
needs `?capture=1`, which is what makes `Scene` publish `window.__office` (scene, camera, and a
`robots` getter) from the `SceneBridge` component. It asserts, per bot on stage: identity meshes are
mounted, exactly one visible antenna ball survives and only for a `ball` identity, exactly one pulsing
topper exists, the accent colour is the identity colour, and **the name pill's bottom edge clears the
topmost identity vertex**. The pill check is a real regression guard — `<Html center>` used to drop
half the pill (~27 px ≈ 0.19 m) back over the topper on three of four bots. The ball count guards the
other duplicate-owner failure: it is what a `default` bot would trip if the baked `antennaBall` were
left visible next to `AntennaTopper`'s own ball.

Run it on both bodies; the `.glb` path has its own plumbing (portals, hidden baked ball):

```bash
node scripts/identity-render.mjs                                   # procedural
TARGET_URL='http://localhost:3001/?capture=1&model=on' node scripts/identity-render.mjs
```

`VIEW_W` / `VIEW_H` override the viewport; the gate is green at 1280x720, 1440x900, 1600x1000 and
1920x1080. Pill clearance is tightest at the smallest viewport, so check that one when touching
`PILL_Y`, `PILL_Z` or any topper envelope.

All scripts drive Chrome over CDP; use `CDP_PORT=9224` for the hardware-GPU profile (port 9223 is
SwiftShader software rendering and reports misleadingly low FPS).

Launch that Chrome **without** `-WindowStyle Minimized` and with
`--disable-background-timer-throttling --disable-backgrounding-occluded-windows
--disable-renderer-backgrounding`; a minimised window freezes `requestAnimationFrame`, which makes
`perf.mjs` hang and the canvas look blank. `smoke.mjs` and `perf.mjs` attach to a tab whose URL
already contains `localhost`, so create it first with
`PUT http://127.0.0.1:9224/json/new?<url>`.

`smoke.mjs` without `?capture=1` reports `canvasNonBlank: false` — that is a harness artefact, not a
rendering bug: the demand loop has already discarded the drawing buffer when the probe reads it.

`perf.mjs` expects three numbers: **10–11** render FPS with `--idle`, **~29–30** when agents are
active, and a much higher rAF rate. A low render rate with an equally high rAF rate means the
throttle is firing too rarely; recheck the accumulator cushion in `PerformanceManager`. A render
rate *above* the budget means something else is invalidating every frame — check in-canvas store
subscriptions, `OrbitControls.update()` during a camera flight, or drei `<Html>` re-renders.
