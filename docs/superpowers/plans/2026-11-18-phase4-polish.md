# Phase 4 — Toy UI Audio + Robot Model Factory · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:executing-plans. Steps use `- [ ]` checkboxes.

**Goal:** Ship the two open Phase 4 items — muted-by-default Web Audio UI clicks, and a generated `.glb` robot model that shares one part-spec with the on-screen procedural robot.

**Architecture:** `src/lib/robotModel.ts` becomes the single source of truth for the robot's blocks. The procedural `WorkerRobot.tsx` renders static blocks through `<RobotParts/>` (animation channels untouched), and `scripts/build-robot-model.mjs` imports the same module to emit `public/models/worker-robot.glb`. A separate persisted `useUiStore` holds sound/model preferences; the `.glb` path is opt-in behind `?model=` + a HUD toggle and is dynamically imported so `GLTFLoader` never enters the initial chunk.

**Tech Stack:** Next 16 (App Router, client components), React 19, three 0.187 + `@react-three/fiber` 9 + drei 10.7, Zustand 5, Node 24 (native TS type-stripping for the generator), `GLTFExporter` from `three/examples/jsm`.

**Spec:** `docs/superpowers/specs/2026-11-18-phase4-polish-design.md`

## Global Constraints

- `useAgentStore` stays the telemetry source of truth; presentation state goes in `useUiStore`. `applyLiveTelemetry`, `tick`, `setStatus`, `setAllStatuses`, `cycleAll`, `resetTelemetry` must not change.
- In-canvas subscriptions are value-compared (`useShallow` / primitive selectors). Any re-render inside `<Canvas>` invalidates the demand loop.
- `Math.random()` never runs during render — use `createSeededRandom` (`src/lib/random.ts`).
- No `new THREE.*` allocations inside `useFrame`.
- Default render path = procedural robot, visually identical to today. No new assets beyond the generated `.glb` + meta.
- `npx tsc --noEmit`, `npx eslint .`, `npx next build` must pass; `npm run smoke` must show zero page/console errors.
- Idle budget must stay at ~10 render FPS with the model path off.
- Audio defaults to **muted**; `AudioContext` is created only on a user gesture, and only after the user enables sound.

## Review Focus

- A `.glb` that loads but sits floating, sunk into the chair, or facing backwards → `ModelRobot` must place by `DESK_SEAT` and normalise height to `ROBOT_HEIGHT`.
- A missing/corrupt model URL → exactly one `console.warn`, procedural robot still renders, no page error (smoke test asserts zero console errors).
- Per-agent accent colour lost on the model path → body/limb parts must be recoloured per clone without mutating shared materials across the four desks.
- Sound enabled on a page that never received a gesture → no `AudioContext`, no autoplay warning.
- Procedural robot visually drifting after the spec refactor → before/after screenshot of the same pose must match.

---

### Task 1: Part spec module

**Files:**
- Create: `src/lib/robotModel.ts`

**Interfaces:**
- Produces: `ROBOT_NODES`, `ROBOT_PARTS`, `ROBOT_COLORS`, `FACE`, `ROBOT_HEIGHT`, and types `RobotNodeId`, `RobotPart`, `RobotNode`, `PaletteKey`.

- [ ] **Step 1:** Transcribe every static block from today's `WorkerRobot.tsx` into `ROBOT_PARTS` with identical numbers, `node` ids `root|torso|head|antenna|armL|armR`, and palette keys `body|limb|cream|ink|blush|pink|metal|accent`.
- [ ] **Step 2:** Export `FACE` (eye size/offset, glint, mouth, blush) for the runtime-driven parts.
- [ ] **Step 3:** Export `ROBOT_HEIGHT` (root-local bounding height) and assert it in Task 3's generator.
- [ ] **Step 4:** `npx tsc --noEmit` passes.

### Task 2: Procedural robot renders the spec

**Files:**
- Create: `src/components/canvas/RobotParts.tsx`
- Modify: `src/components/canvas/WorkerRobot.tsx`

**Interfaces:**
- Consumes: `ROBOT_PARTS`, `ROBOT_COLORS`, `FACE`, `RobotNodeId` from Task 1.
- Produces: `<RobotParts node={id} accent={hex} />`.

- [ ] **Step 1:** `<RobotParts/>` maps `ROBOT_PARTS` filtered by `node`, emitting box/cylinder/sphere meshes; `accent` and `limb` palette keys resolve from the agent colour.
- [ ] **Step 2:** Replace the static `<mesh>` blocks in `WorkerRobot.tsx` with `<RobotParts/>` calls inside the existing groups; keep every ref, every `useFrame` line, and the driven parts (eyes, mouth, hands, antenna ball) untouched.
- [ ] **Step 3:** `npx tsc --noEmit` + `npx eslint .` pass.
- [ ] **Step 4:** Screenshot before/after from the same camera pose; they must match.

### Task 3: `.glb` generator

**Files:**
- Create: `scripts/build-robot-model.mjs`
- Create: `public/models/worker-robot.glb` (generated)
- Create: `public/models/worker-robot.meta.json` (generated)
- Modify: `package.json` (`"build:model"`)

**Interfaces:**
- Consumes: `ROBOT_NODES`, `ROBOT_PARTS`, `ROBOT_COLORS`, `FACE`, `ROBOT_HEIGHT`.
- Produces: a `.glb` whose node names equal `ROBOT_NODES` ids and whose mesh names equal part ids; parts marked `accent` carry `userData.recolor = 'body' | 'limb'`.

- [ ] **Step 1:** Install `FileReader` polyfill over `node:buffer`'s `Blob`, import the TS spec directly.
- [ ] **Step 2:** Build the group hierarchy, export with `GLTFExporter.parseAsync(..., { binary: true })`, write both files.
- [ ] **Step 3:** Round-trip: parse back with `GLTFLoader`, assert root name, node names, part count, and bbox height within 1 mm of `ROBOT_HEIGHT`; exit non-zero otherwise.
- [ ] **Step 4:** `npm run build:model` prints byte size + part count and exits 0.

### Task 4: Audio + UI preference store

**Files:**
- Create: `src/lib/audio.ts`
- Create: `src/store/useUiStore.ts`
- Create: `src/components/hud/SoundToggle.tsx`

**Interfaces:**
- Produces: `playClick()`, `playToggle()`, `playConfirm()`; `useUiStore` with `{ soundEnabled, useModel, setSoundEnabled, setUseModel }` persisted under `9router-office:ui`; `<SoundToggle/>`.

- [ ] **Step 1:** `audio.ts` lazily creates one `AudioContext` on first call, routes voices through a `GainNode` master at 0.06, and returns early when muted, when `prefers-reduced-motion` matches, or when the context throws.
- [ ] **Step 2:** `useUiStore` persists only the two booleans; defaults `false`/`false`.
- [ ] **Step 3:** `<SoundToggle/>` is an `aria-pressed` icon button that plays `playToggle()` when switched on.
- [ ] **Step 4:** `npx tsc --noEmit` + `npx eslint .` pass.

### Task 5: Opt-in model robot

**Files:**
- Create: `src/components/canvas/ModelRobot.tsx`
- Modify: `src/components/canvas/Scene.tsx`

**Interfaces:**
- Consumes: `useGLTF`, drei `Clone`, `DESK_SEAT`, `ROBOT_HEIGHT`, `useUiStore.useModel`.
- Produces: `<ModelRobot url status accentColor />` rendering a height-normalised clone at the desk seat.

- [ ] **Step 1:** Resolve the URL once: `?model=` param → explicit path or `off`; otherwise the persisted preference. Reject anything not starting with `/` or `http(s)://` with one `console.warn`.
- [ ] **Step 2:** `Scene` dynamically imports `ModelRobot`; when the model path is active it replaces `<WorkerRobot/>` in `AgentNode`, keeping the `<Html>` pill, blob shadow, and selection ring.
- [ ] **Step 3:** `ModelRobot` normalises height to `ROBOT_HEIGHT`, seats at `DESK_SEAT`, clones materials per instance, and tints `userData.recolor` parts with the agent accent.
- [ ] **Step 4:** Load failure logs one `console.warn` and renders nothing extra; `Scene` falls back to the procedural robot.

### Task 6: HUD wiring

**Files:**
- Modify: `src/components/hud/ControlDock.tsx`

- [ ] **Step 1:** Add `<SoundToggle/>` and a model toggle (`Box` icon) to the header.
- [ ] **Step 2:** Call `playClick()` on status triggers / robot picker / camera presets, `playToggle()` on broadcast and mute, `playConfirm()` on Reset.
- [ ] **Step 3:** `npx tsc --noEmit` + `npx eslint .` pass; keyboard shortcuts 1–5 still work.

### Task 7: Verification + docs

- [ ] **Step 1:** `npm run build:model`, `npx tsc --noEmit`, `npx eslint .`, `npx next build` all pass.
- [ ] **Step 2:** `npm run smoke` → zero errors, `canvasNonBlank: true`, five states reachable.
- [ ] **Step 3:** Screenshot with `?model=/models/worker-robot.glb` and with `?model=/models/missing.glb`.
- [ ] **Step 4:** `npm run perf -- --idle` still reports 10–11 FPS; record the model-path figure too.
- [ ] **Step 5:** Update `TASKS.md` (Phase 4 checked), `AGENT.md` (§5/§6/§7), `ARCHITECTURE.md` (new files, model pipeline, audio notes).
