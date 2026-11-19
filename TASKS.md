# Implementation Roadmap

## Phase 1: 3D Scene Foundation & Simulation Mode
- [x] Initialize Next.js (TypeScript, Tailwind CSS) and install `@react-three/fiber`, `@react-three/drei`, `three`, `@types/three`, `zustand`.
- [x] Create `src/store/useAgentStore.ts` with 4 default mock agents (Gemini, Claude, GPT, Ollama) and a `simulationMode` toggle.
- [x] Build `Scene.tsx` with `OrbitControls` and a central workstation layout.
- [x] Build the per-agent workstation and character rig.
- [x] Build `ControlDock.tsx` (HUD) allowing manual state triggers (`IDLE`, `THINKING`, `STREAMING`, `ERROR`).

**Phase 1 verification (complete):** runs at `http://localhost:3001` with zero page/console errors.
Headless-Chrome CDP smoke test (`node scripts/smoke.mjs --trigger-states`) drives all four state
buttons and screenshots each state into `artifacts/`. Measured **60 FPS** at 1600×1000 on a real
GPU (AMD Radeon, ANGLE/D3D11); `npx tsc --noEmit` and `npx eslint .` both pass clean.

## Phase 1.5: "Fun & Colorful Blocky Office" Visual Redesign
Replace the dark sci-fi command centre with a bright, toy-like isometric office diorama
(Crossy Road / Overcooked energy). The Zustand store and Simulation Mode behaviour are
**unchanged** — this is a pure presentation pass.

### Lighting & room
- [x] Remove neon/bloom; switch to bright warm daylight (sun + ambient + hemisphere + fills).
- [x] Neutral tone mapping so the pastel palette stays saturated (ACES desaturated it).
- [x] Rebuild `OfficeRoom.tsx`: contiguous oak plank floor (instanced) + solid sub-floor, rainbow
      rug, cream walls, three windows onto a pastel-blue sky with drifting clouds, ticking wall
      clock, whiteboard of colourful scribbles, open bookshelf, water cooler, blocky cactus and
      monstera.
- [x] Omit the wall nearest the camera (diorama cutaway) so the office is fully visible.

### Characters
- [x] Rebuild the character as a blocky worker robot (`WorkerRobot.tsx`): retro-monitor head,
      big square eyes with glints, LED mouth, blush, ear bolts, springy antenna + ball, bow tie,
      name badge, bouncy boxy arms.
- [x] Per-provider body colours: Gemini `#5CB8F2`, Claude `#FF9D5C`, GPT `#58D6A9`, Llama `#B98BFF`.
- [x] Seat the robot properly: seated thighs, shins and block feet on the floor, driven by a single
      `DESK_SEAT` constant shared with `WorkDesk.tsx` so hips land on the seat and hands on the desk.

### Comedic per-state animation
- [x] **IDLE** — chair sway, breathing bob, happy nodding, coffee glances.
- [x] **THINKING** — eager forward lean, super-fast typing, bouncing yellow lightbulb with rays.
- [x] **STREAMING** — typing + colourful cube parcels launched along an arc toward the hub, with
      star/confetti sparkles.
- [x] **ERROR** — startled hops in the chair, 45° head tilt, X X eyes, antenna flailing, cartoon
      grey smoke puffs rising off the monitor.

### Desks & central hub
- [x] `WorkDesk.tsx`: warm wood top, white drawer pedestal, retro-modern monitor with a glowing
      status screen, chunky keyboard (instanced keycaps), coffee mug with steam, paper stack, and a
      colourful swivel chair.
- [x] `CentralHub.tsx`: 9ROUTER CORE as a cheerful server desk / pneumatic-tube hub — cabinet,
      server stack with per-agent pastel indicator lamps, funnel + glass dome, tube runs, springy
      antenna, orbiting parcel carousel, and a floating label.

### HUD
- [x] Replace the dark black-cyan panels with clean, friendly cards (rounded corners, warm white
      surfaces, slate ink, bright candy accents).
- [x] Switch typography to **Nunito** (UI) and **Fredoka** (display).
- [x] Restyle `ControlDock.tsx` (chunky sticker buttons, broadcast toggle, robot picker, keys 1–5)
      and `TacticalOverlay.tsx` (identity, office vitals, robot spotlight, mood log).
- [x] Set the initial isometric camera to frame the whole office clearly.

### Context files
- [x] Rewrite `AGENT.md` for the Fun & Colorful Blocky Office direction.
- [x] Rewrite `ARCHITECTURE.md` with the state/animation matrix, scene composition and directory map.

**Phase 1.5 verification:** zero page/console errors across all five states; `npx tsc --noEmit`,
`npx eslint .` and `npx next build` all pass. Frame budget improved by batching the floor planks
and keyboard keycaps into `InstancedMesh` (42.5 → ~51 FPS at 1600×1000).

## Phase 1.75: iGPU Performance Optimization
Optimize rendering for integrated GPUs on thin laptops without changing the visual design.

### Canvas config
- [x] Lock `dpr={1}`, disable `antialias`, set `powerPreference: 'low-power'`.
- [x] Remove `shadows="percentage"` from Canvas.

### Shadow removal + blob shadows
- [x] Strip all `castShadow` / `receiveShadow` from every mesh (56 instances across 4 files).
- [x] Remove shadow-casting directional light config (shadow map, bias, orthographic camera).
- [x] Add `BlobShadow` component: cheap dark transparent circles under each desk and central hub.

### Dynamic FPS limiter + tab sleep
- [x] Set `frameloop="demand"` and build `PerformanceManager` with a throttled `invalidate()` loop
      (switched from `advance()`; `demand` keeps Three's delta semantics in seconds).
- [x] All agents IDLE → cap at **30 FPS**; any active → cap at **~28 FPS**.
- [x] Tab hidden (`document.hidden`) → **paused** (no invalidations).
- [x] Compensate rAF quantisation (half-refresh cushion) so a 28 FPS budget renders at ~29 FPS
      instead of rounding down to ~19 FPS.
- [x] HUD FPS meter reads real render frames (`src/lib/renderStats.ts`), not the rAF rate.
- [x] `?capture=1` enables `preserveDrawingBuffer` for headless screenshots only.

### Idle budget raised 10 → 30 FPS
- The idle budget started at 10 FPS to protect iGPUs. Raised to 30 on request: `IDLE_FRAME_MS`
  is now `1000 / 30`. The active budget stays `1000 / 28`, so an active office or a camera
  flight costs the same as before. Measured: idle **30.1 FPS**, active **30.0 FPS**.

### GC pressure fix
- [x] Move `new THREE.Color()` out of `useFrame` in `WorkDesk.tsx` into `useRef`.

### Context updates
- [x] Update `AGENT.md` and `ARCHITECTURE.md` to reflect new performance profile.

## Phase 2: 9Router Telemetry Integration
- [x] Inspect 9Router's local Web UI (`Usage` page network requests or local DB/logs) and document the exact payload structure in `src/lib/routerAdapter.ts`.
- [x] Build `/api/telemetry` route to fetch/stream live metrics from local 9Router without CORS issues.
- [x] Implement auto-fallback logic: seamlessly switch to Simulation Mode if 9Router is offline, and auto-connect when 9Router becomes reachable.

**Phase 2 findings:** 9Router's dashboard API (`/api/usage/*`) is JWT/cookie protected and
returns 401 to external callers. The SQLite database at
`%APPDATA%/9router/db/data.sqlite` (macOS: `~/Library/Application Support/9router/db/`,
Linux: `~/.config/9router/db/`) is readable read-only, already in WAL mode, and holds exactly
the data the Usage page renders.

Tables used:
- `usageHistory` (`timestamp`, `provider`, `model`, `promptTokens`, `completionTokens`, `cost`,
  `status`, `tokens`, `meta`) — one row per completed request.
- `usageDaily` (`dateKey`, `data`) — JSON rollup with `requests`, `promptTokens`,
  `completionTokens`, `cost`, `byProvider`, `byModel`.
- `providerConnections` (`provider`, `data`) — JSON with `testStatus`, `errorCode`,
  `backoffLevel`, `lastUsedAt`.

Status mapping (implemented in `src/lib/statusResolution.ts`, asserted by
`npm run status:test`): last request `<4s` → `STREAMING`; `<25s` → `THINKING`; every *usable*
connection `unavailable` → `ERROR`; otherwise `IDLE`. Traffic is checked first because a
`usageHistory` row only exists after a successful request — a provider with 2/3 healthy accounts
that answered a second ago is working, whatever its flags say. Paused accounts (`isActive = 0`)
are excluded from the counts. The top 4 providers by 24h request count take the 4 desks.
`tokensPerSecond` is completion tokens over a 30s window; `latencyMs` is the median inter-request
gap (there is no latency column).

## Phase 3: HUD Depth & Camera Work
- [x] Drive parcel volume in `ParcelStream` from real `tokensPerSecond` instead of a fixed count
      (2 parcels at a trickle → 10 at ~135 tok/s, with the arc pace scaling too).
- [x] Add floating 3D `<Html>` name/status badges above each desk.
- [x] Add camera focus presets (Overview, Central Hub, Focus on Specific Agent) with smooth damping.

**Phase 3 notes:**
- Parcels: `visibleCount = clamp(ceil(tokensPerSecond / 15), 2, 10)` and
  `pace = 1 + min(1.5, tokensPerSecond / 90)`. Travel/rotation advance through refs
  (`travel`, `clock`) instead of `state.clock`, so pausing the stream does not make the
  parcels jump when it resumes.
- Badges: drei `<Html>` at the derived `[0, PILL_Y, PILL_Z]`, no `center` (the wrapper shifts
  itself up by its own height so the pill's bottom edge sits on the anchor), `pointerEvents="none"`
  and **no** `distanceFactor` — that keeps a constant CSS size, so the pill stays legible in the
  overview and does not balloon in a focus shot. The hub label plate moved to `y = 5.0`
  so the two never overlap in the default framing.
- Camera: `src/lib/cameraBus.ts` is a DOM-level pub/sub (`requestCamera(preset)`), keeping
  presentation-only state out of the telemetry store. `CameraRig` flies position **and**
  look-target with a 0.9 s smoothstep. During a flight it disables `OrbitControls` and
  orients the camera by hand: drei's `OrbitControls` calls `update()` every frame and
  fires `change` → `invalidate()`, which pinned the demand loop at the display refresh
  rate (measured 56.7 FPS instead of 28). One `update()` runs at the end to resync the
  orbit maths.
- The intro dolly now uses the same flight path (`CAMERA_INTRO_S = 1.8`), so the opening
  seconds also respect the frame budget instead of spinning at 60 FPS.
- `PerformanceManager` uses `ACTIVE_FRAME_MS` while `isCameraAnimating()`, so a preset
  still animates smoothly when every robot is idle (measured 10 → 30 FPS during a flight).

**Phase 3 verification (measured):** idle 10.0 FPS, active 30.1 FPS, camera flight 30 FPS
while all robots are IDLE; badges track all four statuses; `tsc`, `eslint .` and
`next build` pass; smoke shows `canvasNonBlank: true` with zero page/console errors.

### Idle-budget regression fixed in Phase 3
Adding the badge/TPS subscriptions initially pushed idle from 10 to ~12 FPS. Cause:
`World` subscribed to `state.agents`, and every telemetry tick builds a fresh array even
when nothing visible changed — each re-render inside `<Canvas>` invalidates the demand
loop, so 2 ticks/s added 2 frames/s. Fix: value-compared subscriptions
(`useShallow` for the id/status/colour lists, primitive selectors in `AgentNode`).


## Phase 4: Polish
- [x] Add subtle Web Audio API toy-like UI clicks (muted by default).
- [x] Add optional `.glb` loader support so rigged models can replace the procedural blocks.

### Phase 4 notes
- Audio (`src/lib/audio.ts`) is synthesised — no asset files. It returns immediately while
  muted, so no `AudioContext` exists for anyone who never opts in; the context is created on
  the first real click. Verified: 0 contexts on a muted load, 1 after enabling, and a
  persisted preference rehydrates without creating one (or warning about hydration).
- The `.glb` path is opt-in (`?model=` or the HUD toggle) and the procedural robot remains the
  default. Shape lives in the file, animation lives in code: `src/lib/robotModel.ts` is the
  single source of truth, `scripts/build-robot-model.mjs` (`npm run build:model`) writes
  `public/models/worker-robot.glb` (72 616 bytes, 30 parts, 2.365 m tall), and
  `ModelRobot.tsx` drives the cloned `torso`/`head`/`antenna`/`armL`/`armR` nodes with the
  same springs as `WorkerRobot.tsx`. `RobotEffects.tsx` keeps the per-status props for both.
- `useGLTF` was rejected for this path: it suspends by throwing and then rethrows the
  rejection during render, and React 19 reports every caught render error to `window`, so the
  missing-file fallback could never pass a zero-page-error gate. `ModelRobot` now loads
  through `GLTFLoader` imperatively with a per-URL promise cache: a bad file becomes state,
  logs exactly one warning, sets the HUD error state, and renders the procedural robot.
- Measured after Phase 4: all-idle **30 FPS** (idle budget raised from 10), model path with an active agent **30 FPS**.

## Phase 4.5: Provider Status Correction
- [x] Stop connection flags from overriding live traffic: a provider with 2/3 healthy accounts was
      labelled degraded even while it was mid-stream, so its robot stopped typing.
- [x] Exclude paused connections (`isActive = 0`) from provider health counts.
- [x] Extract the rules into `src/lib/statusResolution.ts` (pure, no `node:` imports) and add
      `npm run status:test` — assertions run against the shipping code, not a copy.

### Phase 4.5 notes
- **Root cause of the reported bug.** `providerConnections` health was counted per account and
  the flag checks ran *before* the traffic checks. One exhausted CodeBuddy account out of three
  therefore pinned the provider at a degraded label permanently, hiding that the other two
  accounts were serving normally. Verified against the live DB: 70 requests / 53 655 completion
  tokens were served in the 2 h *after* the account was flagged, and `usageHistory` held zero
  non-`ok` rows, so nothing was actually failing.
- **Traffic now wins.** `usageHistory` is only written after a successful request, so a fresh row
  is proof the provider works. Verified live against `/api/telemetry`: status read `STREAMING` at
  3.6 s after a request and `THINKING` from 5.7 s to 24 s. `npm run status:live` prints the same
  verdict against the live database.
- **A time-based staleness rule was investigated and rejected.** `updatedAt` is not the flag
  write time (it also moves on token refresh: a row flagged at 01:50 carried `updatedAt: 07:10`),
  `lastErrorAt` is honest but an exhausted quota stays exhausted for days (observed "Resets in
  167h57m"), and `rateLimitedUntil` — the only field where 9Router declares its own expiry — is
  `null` on all 20 live rows. Expiring the flag would have relabelled genuinely dead accounts as
  healthy, so the flag is honoured until 9Router clears it on its own retry schedule.

## Phase 4.6: Four Statuses & the Error Bubble
- [x] Shrink `AgentStatus` to exactly `IDLE | THINKING | STREAMING | ERROR` and delete the
      degraded fifth status everywhere: the type, `STATUS_META`, `MANUAL_STATUSES`, the store's
      seed/telemetry/cycle paths, both robot bodies, `RobotEffects` (the whole `HelpSign`
      component), `WorkDesk`, `CentralHub`, `Scene`, `ControlDock` and `CommandCenter`.
- [x] Reserve `ERROR` for a provider with **zero usable accounts**, so the label can only ever mean
      "this provider cannot serve".
- [x] Rebuild `describeError(health, now)`: name the cause (`Sign-in failed`, `Quota exhausted`,
      `Rate limited`, `Upstream unavailable`), list the deduped HTTP codes, and append an absolute
      reset date formatted from a fixed English month table in UTC.
- [x] Add `classifyProviderError` and `parseResetMs`, and extend `ConnectionHealth` with `messages`
      and `resetAt` so the formatter has the provider's own words and an absolute instant.
- [x] Render a dismissible error bubble above the desk's name pill, with a native pointer-event
      guard so it cannot select the desk or orbit the camera.
- [x] Add `useUiStore.dismissedErrors` + `dismissError` — keyed by the error text, session-only,
      never persisted and never in the telemetry store.
- [x] Gate the bubble on the same all-accounts-dead condition as `ERROR`; a partial outage shows
      nothing at all.
- [x] Update `scripts/smoke.mjs` (four states, `bubbleVisible` assertion, focused tab so
      `canvasNonBlank` is honest), `scripts/explain-status.mjs` (same gate as the app) and
      `scripts/status-rules.mjs` (51 assertions covering the formatter and the ERROR boundary).

### Phase 4.6 notes
- **Why the fifth status had to go.** A status is a claim about what a robot is doing; "degraded"
  is a claim about spare capacity. Mixing them made 1-of-3-down read as "this provider is broken"
  to the user, while the provider was in fact answering requests. A partial outage now shows
  nothing at all — no status change, no bubble — and the bubble is reserved for the same
  all-accounts-dead condition as `ERROR`, so it can never contradict the pill it sits above.
- **The bubble's reset hint is an absolute instant.** The provider writes `Resets in 167h57m31s`
  once, at failure time, and never updates it. Reprinting that duration would freeze into a lie,
  and recomputing a countdown on every poll would both re-render the canvas each tick and resurrect
  dismissed bubbles. So `summariseConnections` stores `lastErrorAt + parseResetMs(...)` and the
  formatter prints `resets Nov 25`, dropping it entirely once the instant is in the past.
- **Dismissal is keyed by text, not by timestamp.** The bubble returns by itself when the message
  changes and stays closed otherwise. Simulation reuses one sentence, so its `ERROR` seed carries
  a UTC clock stamp with milliseconds — enough to make two triggers inside the same second
  distinct, and readable to the human looking at the bubble. The seed is also prefixed `Demo ·`,
  because the trigger applies it to whatever *live* provider is selected and the text would
  otherwise be indistinguishable from a real quota failure.
- **A dismissal is forgotten when the failure clears.** Otherwise a provider whose text carries no
  reset date — live codebuddy is exactly `Quota exhausted · 429 · 3/3 down` — would be silenced for
  the rest of the session after one dismiss: the quota recovers, dies again, and the identical
  string matches the stored key. `AgentNode` calls `clearDismissedError` whenever `lastError`
  empties, and re-pressing `ERROR` while already in `ERROR` re-stamps instead of no-oping.
- **The pointer guard needs a callback ref.** drei renders `<Html>` children into its own React
  root, so `ref.current` is still `null` when `AgentNode`'s effect runs, and an effect keyed on
  visibility never runs again. The dismissal therefore also has to be handled natively: the guard
  stops the click below the portal's React root, so a React `onClick` would never fire.
- **A stale Tailwind cache can fake a passing build.** The dev server kept serving CSS without any
  of the new utility classes while `tsc` and `eslint` stayed green, so the bubble rendered
  unstyled. Verified by diffing the served stylesheet against the class list; fixed by restarting
  the dev server with a cleared `.next`.

**Phase 4.6 verification:** `npx tsc --noEmit` → 0, `npx eslint` → 0, `npm run status:test` →
51/51, `npm run build` → clean, smoke → four states with `bubbleVisible: true`,
`canvasNonBlank: true`, zero page/console errors, and `npm run status:live` matching the office.

## Phase 5: Per-Provider Bot Identity

Each live provider's bot now looks like that provider: a distinctive head silhouette, an antenna
topper, a chest emblem and the brand colour. Unknown providers keep the original body.

- [x] `src/lib/providerIdentity.ts` — provider key → `ResolvedIdentity` (`id`, `color`, `palette`,
      `shell`, `topper`, `emblem`), 13 identities, `UNKNOWN_PROVIDER_COLORS`, and
      `resolveIdentity`. The only place provider strings are matched.
- [x] `src/lib/robotModel.ts` — `SHELLS` / `TOPPERS` / `EMBLEMS` shape tables, `identityPartsFor()`,
      `identityBounds()`, and the exported `SHELL_ENVELOPE` / `TOPPER_ENVELOPE` / `EMBLEM_ENVELOPE`
      that union into `ROBOT_ENVELOPE_TOP` / `ROBOT_ENVELOPE_HEIGHT`. `ROBOT_HEIGHT` stays 2.365 m.
      The module keeps **zero runtime imports** so Node can type-strip it for the build scripts.
- [x] Identity travels on telemetry (`AgentTelemetry.identity`), not by matching provider strings at
      render time; `routerAdapter.ts` lost `PROVIDER_META` and its hash palette.
- [x] `RobotParts.tsx` — `RobotIdentityParts` (identity only) and `AntennaTopper`, whose pulse lives
      in a wrapper group so every topper keeps the old ball's "alive" feel.
- [x] `WorkerRobot.tsx` — identity threaded through the rig; the runtime-driven antenna ball mesh is
      replaced by `<AntennaTopper>`.
- [x] `ModelRobot.tsx` — identity parts `createPortal`-ed onto the clone's own `head` / `torso` /
      `antenna` joints so they follow the performance; baked `antennaBall` hidden when replaced.
- [x] `Scene.tsx` — identity selector + threading, derived `PILL_Y` / `PILL_Z`, and the
      `?capture=1` `SceneBridge` that publishes `window.__office` for the render gate.
- [x] `scripts/identity-rules.mjs` (569 assertions) and `scripts/identity-render.mjs` (26 live-graph
      assertions, run on both bodies).

### Phase 5 notes
- **Identity is data, not branches.** The rig, the `.glb` path and the tests all read the same three
  tables. Adding a provider is a table edit; no component knows a provider name.
- **The `.glb` gets identity portal-ed on.** Its clone already contains the baked shared body, so it
  mounts `RobotIdentityParts` (identity only) — mounting `RobotParts` again would double every block.
  Portals onto the joints are what make a crest follow the head when it looks around and tilts 45° on
  `ERROR`.
- **The render gate caught a real bug, which is why it exists.** A screenshot cannot tell a mounted
  shell from a recoloured one, so `identity-render.mjs` walks the live graph. It found the name pill
  covering the topper on three of four bots. Two causes, both measured: `<Html center>` drops half
  the pill (~27 px ≈ 0.19 m at the desks) back over the anchor, and the pill sat 0.48 m nearer the
  camera than the antenna, so the same world height projected *lower* on screen. Fixed by anchoring
  the wrapper bottom-centre and moving the pill into the antenna's plane; clearance is now 5–9 px at
  every tested viewport.
- **Envelope ≠ body height.** `ROBOT_HEIGHT` (2.365 m) is what the `.glb` build asserts; the pill
  rides `ROBOT_ENVELOPE_TOP` (2.09 m above the seat at rest, `ROBOT_ENVELOPE_HEIGHT` 2.49 m measured
  from the floor) plus `TOPPER_ANIMATION_LIFT` (0.05 m), measured as the worst animated topper peak
  over 6 s of live idle (2.537 m). A taller topper lifts the pill itself.
- **Two suspected defects were measured and dismissed.** The arch topper's legs clear the cranium by
  28 cm — what looks like intersection is `shellArchPost`, the head crest, which is meant to hug it.
  The chest emblem is not occluded by desk or keyboard (camera→emblem ray hits no furniture) and
  protrudes 10 mm past the `belly` panel, so it neither hides nor z-fights.
- **`react-hooks/purity` shapes the model path.** The portals need the joints during render, but
  `useFrame` mutates them, so `ModelRobot` keeps the joints in a `useMemo` and animates through a ref
  that always points at the current set.

**Phase 5 verification:** `npm run identity:test` → 569/569, `node scripts/identity-render.mjs` →
26/26 on both the procedural and `?model=on` bodies (green at 1280x720, 1440x900, 1600x1000 and
1920x1080), `npx tsc --noEmit` → 0, `npx eslint` → 0, `npm run smoke` → clean, `npm run layout:test`
→ 15/15 with `pills=4/4` at every viewport, `npm run build:model` → 30 parts / 2.365 m with
`git diff public/models/` empty, `npm run build` → clean.

## Phase 5.1: Four-Role Brand Palettes

Each bot now wears four brand colours instead of one flat hue. `RobotPalette { body?, limb?,
accent?, extra? }` in `src/lib/robotModel.ts` names the roles, all optional; `RECOLOR_ROLES` is the
single list the `.glb` generator and `ModelRobot.tsx` both read, and `resolveRobotColor(key, accent,
palette?)` resolves a part's colour at render time.

- [x] `src/lib/providerIdentity.ts` — all 12 known providers carry a four-role palette sampled from
      that provider's own logo. `default` keeps an **empty** palette `{}`, so an unknown provider
      keeps its old body, limbs, shins, badge and hash-derived colour. One part did move: the bow tie
      is the `accent` role, so it now takes the runtime hash accent instead of the old baked pink
      (`#ff6b7a` / `#e05a6a`). The tie is the only part of the default bot that changed.
- [x] `src/lib/robotModel.ts` — `RobotPalette` and `RECOLOR_ROLES`; `accent2` is gone. Fallback
      order: `limb` derives from the darkened `body` (not from `accent`), `accent` falls back to
      `body`, `extra` falls back through `limb` to the darkened `body`. `pink` serves the face's
      error bar; `pinkDeep` is retained but currently unused.
- [x] `.glb` body bakes all four roles: 12 meshes carry `userData.recolor` — `cranium` / `chest` =
      `body`, `bowTieL` / `bowTieR` / `bowTieKnot` / `nameBadgeStripe` = `accent`, `upperArmL` /
      `upperArmR` / `thighL` / `thighR` = `limb`, `shinL` / `shinR` = `extra`.
- [x] `scripts/build-robot-model.mjs` fails if any part carries the wrong role after the round trip.
- [x] `scripts/identity-render.mjs` imports the shipping tables and compares **every** part's mesh
      colour against the hex its role resolves to; `hasModelRoot` proves the `.glb` run is not
      measuring the procedural fallback.

**Phase 5.1 verification:** `npm run identity:test` → 723 assertions, `npm run identity:render` →
42 assertions (procedural rig), `npm run identity:render:model` → 42 assertions (`.glb` rig),
`npm run build:model` → `parts 30`, `height 2.365 m`, `tintable 12 meshes` with a deterministic
`.glb` sha256 across runs, `npx tsc --noEmit` → 0, `npx eslint` → 0.
