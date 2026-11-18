# Phase 4 — Polish: Toy UI Audio + Robot Model Factory

**Status:** approved by the human partner in conversation (2026-11-18)
**Scope:** the two open items in `TASKS.md` → Phase 4
**Author:** assistant, on the human partner's instruction ("buat aja, cari pilihan terbaik")

---

## 1. Intent and why

Two separate goals, both purely additive. Nothing in the current office may change for a user who
does not opt in.

1. **Toy UI clicks.** The office is a toy diorama with chunky sticker buttons, but every click is
   silent. Subtle Web Audio blips make it feel like a toy, and must be **muted by default** so
   nobody is surprised by sound.
2. **A robot model factory.** The human partner wants *me* to author the robot's 3D model, and
   expects to request shape tweaks over time ("kepalanya kurang besar", "warnanya ungu"). The
   robot currently exists only as hand-written JSX in `WorkerRobot.tsx`. To make future tweaks a
   one-line change instead of a refactor, the robot's geometry must become **data**, and that same
   data must be exportable as a real `.glb` file that can be opened in Blender or a glTF viewer.

## 2. Goals / non-goals / anti-goals

**Goals**
- A single source of truth (`src/lib/robotModel.ts`) that both the on-screen procedural robot and
  the generated `.glb` are built from, so they can never drift apart.
- A committed, runnable generator (`npm run build:model`) that emits
  `public/models/worker-robot.glb`.
- An **opt-in** `.glb` path: `?model=/models/worker-robot.glb` plus a HUD toggle. Default remains
  the procedural robot.
- Sound effects synthesised with the Web Audio API (no audio asset files), muted by default,
  preference remembered in `localStorage`.
- Zero change to the telemetry store, the simulation behaviour, or the 10/28 FPS budget when the
  new features are off.

**Non-goals**
- No skeletal skinning, no rig, no animation clips baked into the `.glb`. The robot's blocks are
  rigid by design; per-node TRS animation is cheaper on an iGPU than a skinned mesh.
- No drag-and-drop or arbitrary-URL model loading. The loader accepts a path under `/public` or an
  absolute `http(s)` URL supplied by the query string, and nothing else.
- No per-status audio, no background music, no volume slider (mute toggle only).
- No change to the visual design of the office, HUD, or robots.

**Anti-goals (these would mean the work failed even if it "works")**
- The default view renders even slightly differently from today.
- `GLTFLoader` lands in the initial JS chunk for users who never use a model.
- The idle frame budget regresses (the FPS meter must still read ~10 when all robots are IDLE).
- The generator produces a file that the app cannot load, or the app loads a file that looks
  different from the procedural robot.

## 3. Constraints (inherited, non-negotiable)

- The Zustand `useAgentStore` is the telemetry source of truth; presentation state must not enter
  it (see `AGENT.md` §6). Audio/model preferences therefore live in their own small store.
- In-canvas subscriptions must be value-compared (`useShallow` / primitive selectors); any re-render
  inside `<Canvas>` invalidates the demand loop.
- `Math.random()` must never run during render (React 19 `react-hooks/purity`); use
  `createSeededRandom`.
- No `new THREE.*` allocations inside `useFrame`.
- No external 3D or audio assets; everything is procedural and local.
- `tsc --noEmit`, `eslint .`, and `next build` must all pass; the smoke test must report zero
  page/console errors.

## 4. Approaches considered

### 4a. Where the robot's shape lives

| Approach | Trade-off | Verdict |
| --- | --- | --- |
| Keep JSX as the only source; generator duplicates the numbers | Two copies that silently drift; a tweak needs two edits | Rejected |
| Author the `.glb` by hand-editing glTF JSON | No dependency, but hand-computed buffers/accessors; unmaintainable | Rejected |
| Blender | Best for sculpting, but not installed and not scriptable from this session | Rejected |
| **Part spec in `robotModel.ts`; JSX and generator both consume it** | One source of truth; a tweak is one number; the generator is a real, re-runnable script | **Chosen** |

### 4b. How much goes into the `.glb`

| Approach | Trade-off | Verdict |
| --- | --- | --- |
| Shape only; animation stays in `useFrame` | The on-screen robot is guaranteed identical; every shape tweak is a one-number change; no animation re-baking | **Chosen** |
| Shape + 5 baked animation clips | The file is self-playing in a viewer, but duplicates the animation maths, risks subtle drift, and every shape tweak forces a re-bake of all clips | Rejected for now; can be layered on later without rework |

The human partner chose "cari pilihan terbaik" and approved shape-only, because the tweaks they
expect to request are *shape* tweaks.

### 4c. How the model reaches the scene

| Approach | Trade-off | Verdict |
| --- | --- | --- |
| **Query param + HUD toggle, files served from `/public/models`** | No upload UI, testable over CDP, safe (only files that ship can be loaded), default untouched | **Chosen** |
| URL text input persisted in `localStorage` | More flexible, but needs URL validation, CORS/failure UI, and is hard to test automatically | Rejected |
| Drag & drop a `.glb` onto the window | Most impressive, but state is lost on reload and it fights OrbitControls | Rejected |

## 5. Design

### 5.1 The part spec (`src/lib/robotModel.ts`)

A pure data module — no React, no three — that describes the robot as:

```ts
export interface RobotPart {
  id: string;                       // stable node name, e.g. 'cranium'
  parent: RobotNodeId;              // node this part is rigidly attached to
  size: [number, number, number];   // box dimensions, metres
  position: [number, number, number];
  rotation?: [number, number, number];
  color: keyof typeof ROBOT_COLORS; // palette key, so a recolour is one edit
  kind?: 'box' | 'cylinder' | 'sphere';
  radius?: number;                  // cylinder/sphere
  segments?: number;
}

export interface RobotNode {
  id: RobotNodeId;                  // 'root' | 'torso' | 'head' | 'antenna' | 'armL' | ...
  parent: RobotNodeId | null;
  position: [number, number, number];
}
```

`ROBOT_COLORS` holds the fixed palette. Three keys are **derived per agent** and resolved by
`resolveRobotColor(key, accent)`:
- `body` / `accent` → the agent's `accentColor`
- `limb` → `accentColor × 0.82` (exactly today's `limbColor` computation)

This matters because today's limbs are a *derived shade*, not a second palette entry — a single
flat colour per key could not express it. `ROBOT_NODES` and `ROBOT_PARTS` are plain arrays, ordered
parent-first so both consumers build in one pass. Numbers are copied verbatim from today's
`WorkerRobot.tsx` so the procedural result is pixel-identical.

The module also exports `robotBounds()` and `ROBOT_HEIGHT` — the rest-pose axis-aligned bounds,
computed from the spec (rotated parts use their rotation-aware extents) rather than hardcoded.
Measured value: **2.365 m** from floor (feet at root-local `y = −0.4`) to antenna-ball top. A wrong
constant here would scale the model path against the procedural robot, so the number is derived,
never typed.

Only the robot's own body is described here. State props (lightbulb, help sign, smoke, parcels,
sparkles) stay hand-written in `WorkerRobot.tsx` — they are effects, not the character.

**Seat numbers do not belong here.** `DESK_SEAT` stays owned by `WorkDesk.tsx`, and the spec's
coordinates are root-local: the robot's root origin sits on the chair seat, so its feet land at
root-local `y = −0.4`. The generator therefore never imports `DESK_SEAT` (it is `.tsx` and cannot
be loaded by Node's type-stripping anyway); it bakes a root-local model and records only
`rootOrigin: "seat"` in the metadata. `ModelRobot` positions the clone at `DESK_SEAT` exactly once.

### 5.2 The procedural robot consumes the spec

`WorkerRobot.tsx` keeps its rig and its animation untouched. Only its **static geometry** changes:
the hard-coded `<mesh>` blocks become a `<RobotParts />` component that maps over `ROBOT_PARTS`,
grouped by `parent` into the existing node refs. Eyes, mouth, blush, bow tie and badges keep their
individual materials because they are driven at runtime (eyes blink/scale, mouth scales, screen
colours lerp). Those runtime-driven parts are declared with a `driven: true` flag and rendered
explicitly, so the animation code keeps its refs.

Verification: a before/after screenshot of the same camera pose must be visually indistinguishable,
and the animation channel code must be unchanged except for how the static meshes are emitted.

### 5.3 The generator (`scripts/build-robot-model.mjs`)

Imports `ROBOT_NODES`, `ROBOT_PARTS`, `ROBOT_COLORS` **directly from the TypeScript module** (Node 24
strips types natively; verified in this session) and builds a `THREE.Group` hierarchy:

- one `Group` per `RobotNode`, named by `id`, positioned exactly as the spec says;
- one `Mesh` per part, named by `id`, with `MeshStandardMaterial` (`metalness: 0`,
  `roughness: 1`) so Blender and glTF viewers show it correctly, or `MeshBasicMaterial` for
  self-lit parts (eyes, glints, screen bars) — the exporter writes those as
  `KHR_materials_unlit`, which round-trips back to `MeshBasicMaterial` (verified in this session);
- `GLTFExporter.parseAsync(root, { binary: true })`, written to `public/models/worker-robot.glb`.

`FileReader` and `Blob` are not global in Node, so the script installs a 12-line `FileReader`
polyfill over `node:buffer`'s `Blob` before calling the exporter (verified working in this session).

The generator also writes `public/models/worker-robot.meta.json`:

```json
{ "version": 1, "generatedAt": "...", "rootOrigin": "seat",
  "nodeNames": ["torso", "head", "..."], "partCount": 33,
  "heightMetres": 2.365 }
```

`heightMetres` is the generator's *self-check* — it is compared against `ROBOT_HEIGHT` and a
mismatch fails the build. `ModelRobot` normalises against `ROBOT_HEIGHT` imported from the spec, so
a hand-made model of any size seats correctly without editing code. `seatOffset` deliberately does
not exist (see §5.1).

A **round-trip check** runs inside the generator: after writing the file it parses it back with
`GLTFLoader`, asserts the root name, asserts the node names match `ROBOT_NODES`, and asserts the
bounding box height matches the spec within 1 mm. A generator that writes an unloadable file exits
non-zero.

`package.json` gains `"build:model": "node scripts/build-robot-model.mjs"`.

### 5.4 The opt-in model path

New file `src/components/canvas/ModelRobot.tsx`, loaded with `next/dynamic` from `Scene.tsx` so
`GLTFLoader` stays out of the initial chunk:

- `useGLTF(url)` → `clone` from `three-stdlib`'s `SkeletonUtils` (works for unskinned hierarchies
  too) so each of the four desks gets its own copy;
- positions the clone at `DESK_SEAT` and normalises scale so the model's bounding-box height equals
  `ROBOT_HEIGHT` (2.365 m) — a hand-made model of any size then sits correctly without editing code;
- **clones materials per instance** before tinting. `SkeletonUtils.clone` shares material instances
  across clones, so mutating `material.color` would make all four desks the same colour;
- tints per palette role: parts whose `userData.recolor === 'body'` get `accentColor`, and
  `'limb'` gets `darkenHex(accentColor, 0.82)` — the same derived shade the procedural rig uses;
- converts loaded `MeshStandardMaterial` to `MeshLambertMaterial` (same colour, flat shading) so the
  model path matches the procedural robot's tone under the office lights;
- keeps the existing `<Html>` name/status pill and blob shadow (those live in `AgentNode`, so they
  survive automatically);
- **status effects stay procedural and stay visible.** `ThoughtBulb`, `HelpSign`, `SmokePuffs`,
  `ParcelStream` and `Sparkles` are extracted from `WorkerRobot.tsx` into a shared
  `src/components/canvas/RobotEffects.tsx` that takes the robot's root-relative anchors as props.
  Both the procedural rig and `ModelRobot` render it, so opting into the model never silently
  deletes the comedy. ERROR eyes are the one exception: the `.glb` bakes a neutral face, so the
  model path shows the status through the effects, the pill, and the desk monitor instead.
- on load error: **an error boundary around the model subtree** swallows the throw (otherwise
  React logs `console.error` and unmounts), renders the procedural robot instead, logs exactly one
  `console.warn`, and pushes a `modelError` flag into `useUiStore` so the HUD toggle can revert and
  show "couldn't load".

Selection rules, evaluated once on mount in `Scene.tsx`:

```text
?model=<path>  ->  use that path for all desks (overrides the stored preference)
?model=off     ->  force procedural (wins over everything)
?model=on      ->  force the generated /models/worker-robot.glb
(absent)       ->  stored preference, else procedural
```

So `on` is never a no-op on a fresh profile, and while a URL param pins the model the HUD toggle is
disabled (`title` explains that the URL controls it) so `aria-pressed` can never contradict the
screen.

A URL must start with `/` or `http(s)://`; anything else is ignored with one console warning.

The HUD gets a **single icon toggle** in `ControlDock`'s header (next to the camera presets):
a `Box`/`Bot` icon, `aria-pressed`, tooltip "Use the 3D model file (worker-robot.glb)". It flips the
preference store and reloads the model path without a page refresh.

### 5.5 Audio

New files:

- `src/lib/audio.ts` — a lazily created `AudioContext` and three tiny synth voices built from
  `OscillatorNode` + `GainNode` envelopes:
  - `click()` — 660 Hz square, 45 ms, quick decay (status triggers, picker, camera presets)
  - `toggle()` — two-note blip 520 → 780 Hz (broadcast, mute, model toggle)
  - `confirm()` — three-note rising arpeggio (Reset only)
  - Every voice returns early when muted, when `prefers-reduced-motion` is set, or when the
    context cannot be created. The context is created **on first user gesture only**, so no
    autoplay warning is possible.
  - A master `GainNode` at `0.06` keeps it subtle; voices are fire-and-forget and disconnect on
    `ended` so nothing leaks.
- `src/store/useUiStore.ts` — a tiny Zustand store (`soundEnabled`, `useModel`, `modelError`)
  persisted to `localStorage` under `9router-office:ui`. Defaults: `soundEnabled: false`,
  `useModel: false`, `modelError: null`. Deliberately separate from `useAgentStore`.
  **Hydration-safe:** the store's initial state is the defaults, and persisted values are applied in
  a `useEffect` after mount (`skipHydration` + `rehydrate()`), so server and first client render
  agree and no hydration mismatch reaches the console.
- `src/components/hud/SoundToggle.tsx` — one icon button (`VolumeX` / `Volume2`) in the
  `ControlDock` header. Enabling it plays `toggle()` so the user hears what they turned on.
- `src/components/hud/ModelToggle.tsx` — one icon button (`Box` / `Boxes`), disabled with an
  explanatory `title` while `?model=` pins the choice.

`ControlDock` calls the voices at its existing interaction points; no new listeners are added to the
canvas.

### 5.6 What does *not* change

`useAgentStore`, `TelemetryBridge`, `/api/telemetry`, `routerAdapter`, `cameraBus`, the performance
manager, the demand loop, and every per-status animation channel. The default render path keeps the
procedural robot and therefore the exact same mesh count and draw calls as today.

## 6. File map

```text
src/lib/robotModel.ts            NEW  part/node spec + palette (single source of truth)
src/lib/audio.ts                 NEW  Web Audio synth voices, mute-aware, gesture-gated
src/store/useUiStore.ts          NEW  persisted presentation prefs (sound, model, modelError)
src/components/canvas/RobotParts.tsx   NEW  spec -> JSX for the procedural robot
src/components/canvas/RobotEffects.tsx NEW  shared status FX (bulb, sign, smoke, parcels, sparkles)
src/components/canvas/ModelRobot.tsx   NEW  opt-in .glb desk robot (dynamic import + error boundary)
src/components/hud/SoundToggle.tsx     NEW  mute button
src/components/hud/ModelToggle.tsx     NEW  model-file button
src/components/canvas/WorkerRobot.tsx  EDIT static meshes -> <RobotParts/>, effects -> <RobotEffects/>
src/components/canvas/Scene.tsx        EDIT choose model vs procedural per desk
src/components/hud/ControlDock.tsx     EDIT sound/model toggles + click voices
scripts/build-robot-model.mjs    NEW  spec -> public/models/worker-robot.glb (+ meta + round-trip)
public/models/worker-robot.glb   NEW  committed generated model
public/models/worker-robot.meta.json NEW committed generated metadata
package.json                     EDIT "build:model" script
TASKS.md / AGENT.md / ARCHITECTURE.md  EDIT document Phase 4
```

## 7. Verification plan

1. `npm run build:model` → file written, round-trip assertions pass, prints byte size and part count.
2. `npx tsc --noEmit`, `npx eslint .`, `npx next build` → clean.
3. `npm run smoke` → zero page/console errors, `canvasNonBlank: true`, all five states reachable.
4. Screenshot comparison of the default (procedural) overview before vs. after → visually identical.
   Because the scene animates continuously (`elapsedTime` sway, blink, hop) and the shot script
   sleeps a fixed time, a pixel diff is not meaningful; the check is a **side-by-side visual review**
   of the same camera pose plus a mesh-count assertion (`renderer.info.render.calls` unchanged).
5. `node scripts/shot.mjs` with `?model=/models/worker-robot.glb` → the model robot renders on all
   four desks, pills, shadows and **all five status effects** still animate; no console errors.
6. `?model=/models/missing.glb` → exactly one console warning, the procedural robot still renders on
   all four desks, no page error, and the HUD toggle shows the "couldn't load" state.
7. `npm run perf` (idle) → still 10–11 render FPS with the model path **off**; measure again with it
   **on** and record the number in `ARCHITECTURE.md`.
8. Sound: toggle on, click a status button, confirm `AudioContext` is created only after the click
   and that the toggle state survives a reload; with sound off, no `AudioContext` is ever created.
9. Reload with `localStorage` holding `soundEnabled: true` / `useModel: true` → no hydration warning
   in the console (the persisted state is applied after mount).

## 8. Left to the builder

- Exact oscillator waveforms, durations and the master gain (the spec fixes the shape: short,
  subtle, three distinct voices).
- Whether the model toggle sits before or after the camera presets in the header.
- Whether `ModelRobot` also animates idle breathing (it may; the spec only requires it to sit
  correctly and stay cheap).
- The precise wording of the "couldn't load" note.
- Whether the generated `.glb` should also be committed in a `--check` mode CI step.
