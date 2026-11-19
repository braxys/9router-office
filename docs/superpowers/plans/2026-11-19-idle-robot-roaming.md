# Idle Robot Roaming, Articulated Walking, and Office Interaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable worker robots to stand up from their workstations during idle periods, walk with articulated leg movements to visit visible office POIs, dance in open areas, and rapidly sprint back to their desks when tasks arrive.

**Architecture:** A pure mathematical state machine (`idleRoamState.ts`) calculates roaming positions, orientations, and articulated leg/body angles. A POI registry (`officePoints.ts`) maps unoccluded office waypoints into local workstation coordinates. `WorkerRobot.tsx` uses dynamic `<RobotLegs>` for articulated hip/knee/ankle motion, while `Scene.tsx` updates selection indicators, shadows, and camera focus to track the mobile robot.

**Tech Stack:** React 19, Three.js, React Three Fiber (@react-three/fiber), Zustand, TypeScript.

**Spec:** `docs/superpowers/specs/2026-11-19-idle-robot-roam-design.md`

## Global Constraints
- React 19 / Next.js 16 environment: preserve hooks rules and hydration-safe patterns.
- No allocations inside `useFrame`: scratch vectors or reusable state containers only.
- Suppress roaming when `CAPTURE_MODE` is active (`new URLSearchParams(window.location.search).has('capture')`) to keep layout tests deterministic.
- Keep third-party GLTF models (`ModelRobot`) seated at their desks; procedural robot receives full locomotion.
- Defer status effects (typing jitter, data parcels) until the robot completes `SPRINT_BACK` and sits in the chair.

## Review Focus
- **Sudden task interruption mid-stride:** Robot must immediately switch to sprint speed, return directly to its desk, and sit down without jerky transform glitches.
- **Occlusion avoidance:** POIs must remain in the open floor / visible room zones so robots never get lost behind the 344px right sidebar.
- **Leg alignment consistency:** Seated pose must match the desk chair height (`DESK_SEAT.y = 0.4`), and standing pose must place feet flush with the floor (`y = 0.0`).
- **Camera focus tracking:** When camera preset is 'focus', camera target must follow the wandering robot smoothly instead of pointing at the vacant desk.
- **Demand frame loop performance:** Smooth motion at 30 FPS idle budget without triggering unnecessary React re-renders.

---

### Task 1: POI Registry and Coordinate Conversion

**Files:**
- Create: `src/lib/officePoints.ts`
- Create: `scripts/roam-rules.mjs`
- Modify: `package.json:14-18`

**Interfaces:**
- Consumes: `AGENT_SLOTS` from `src/lib/modelChoice.ts` (or `Scene.tsx`)
- Produces:
  - `OFFICE_POIS: readonly OfficePOI[]`
  - `worldToSlotLocal(worldPos: readonly [number, number, number], slotPos: readonly [number, number, number], slotRotY: number): [number, number, number]`
  - `slotLocalToWorld(localPos: readonly [number, number, number], slotPos: readonly [number, number, number], slotRotY: number): [number, number, number]`
  - `pickNextPoi(currentId: string | null, seed: number): OfficePOI`

- [x] **Step 1: Write failing test in `scripts/roam-rules.mjs`**

```javascript
import { check } from './test-helper.mjs'; // or inline runner matching status-rules.mjs
import { OFFICE_POIS, worldToSlotLocal, slotLocalToWorld, pickNextPoi } from '../src/lib/officePoints.ts';

// Test POI definitions exist and are in visible bounds (x < 7.0 to avoid sidebar occlusion)
check('POIs stay clear of right sidebar x < 7.0', OFFICE_POIS.every(p => p.worldPos[0] < 7.0), true);

// Test coordinate conversion round-trip
const slotPos = [3.8, 0, 0];
const slotRotY = -Math.PI / 2;
const worldPos = [0, 0, 0];
const local = worldToSlotLocal(worldPos, slotPos, slotRotY);
const back = slotLocalToWorld(local, slotPos, slotRotY);
check('world -> local -> world preserves coordinate', Math.hypot(back[0] - worldPos[0], back[2] - worldPos[2]) < 0.001, true);

// Test POI picker alternates correctly
const p1 = pickNextPoi(null, 123);
const p2 = pickNextPoi(p1.id, 124);
check('pickNextPoi selects a different POI when current is passed', p1.id !== p2.id, true);
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/roam-rules.mjs`
Expected: FAIL (module `src/lib/officePoints.ts` not found).

- [x] **Step 3: Implement `src/lib/officePoints.ts` and add npm script to `package.json`**

Implement POI registry with:
- `WHITEBOARD`: `[-0.9, 0, -8.0]`
- `WEST_BOOKSHELF`: `[-7.8, 0, 2.0]`
- `SOUTH_MONSTERA`: `[-5.5, 0, 5.0]`
- `SOUTH_CACTUS`: `[5.5, 0, 5.0]`
- `HUB_RUG_NORTH`: `[0.0, 0, -2.6]`
- `HUB_RUG_SOUTH`: `[0.0, 0, 2.6]`
- `HUB_RUG_WEST`: `[-2.6, 0, 0.0]`
Coordinate rotation math using standard 2D rotation formulas around Y axis.
Add `"roam:test": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/roam-rules.mjs"` to `package.json`.

- [x] **Step 4: Run test to verify it passes**

Run: `npm run roam:test`
Expected: PASS with 0 failures.

- [x] **Step 5: Commit**

```bash
git add src/lib/officePoints.ts scripts/roam-rules.mjs package.json
git commit -m "feat(roam): add office POI registry and coordinate transformations"
```

---

### Task 2: Articulated Legs Component

**Files:**
- Create: `src/components/canvas/RobotLegs.tsx`
- Modify: `src/lib/robotModel.ts:170-202` (export leg dimensions/colors)

**Interfaces:**
- Consumes: `ROBOT_COLORS` from `src/lib/robotModel.ts`
- Produces: `<RobotLegs hipLRef={...} kneeLRef={...} hipRRef={...} kneeRRef={...} footLRef={...} footRRef={...} accent={accent} />`

- [x] **Step 1: Write type & import verification in `scripts/roam-rules.mjs`**

Add tests checking that `RobotLegs` geometry sizes align with `DESK_SEAT.surfaceY` and `LEG_PARTS`.

- [x] **Step 2: Run test to verify it fails or exports are needed**

Run: `npm run typecheck`
Expected: FAIL or missing exports.

- [x] **Step 3: Implement `src/components/canvas/RobotLegs.tsx`**

Build articulated leg hierarchy:
- Left Leg:
  - Hip pivot at `[-0.17, 0.2, 0]` with `hipLRef` (rotates around X).
  - Thigh box `[0.2, 0.38, 0.2]`.
  - Knee pivot at bottom of thigh with `kneeLRef` (rotates around X).
  - Shin box `[0.18, 0.44, 0.18]`.
  - Ankle / foot box `[0.21, 0.12, 0.28]` with `footLRef`.
- Right Leg:
  - Mirror at `[+0.17, 0.2, 0]` with `hipRRef`, `kneeRRef`, `footRRef`.
- Export helper `applyLegPose(refs, pose: { hipL, kneeL, footL, hipR, kneeR, footR })`.

- [x] **Step 4: Run typecheck to verify component types**

Run: `npm run typecheck`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/components/canvas/RobotLegs.tsx src/lib/robotModel.ts
git commit -m "feat(robot): implement articulated leg component with hip and knee pivots"
```

---

### Task 3: Idle Roam State Machine

**Files:**
- Create: `src/lib/idleRoamState.ts`
- Modify: `scripts/roam-rules.mjs`

**Interfaces:**
- Consumes: `OfficePOI`, `worldToSlotLocal` from `src/lib/officePoints.ts`
- Produces:
  - `type RoamSubState = 'SEATED' | 'STAND_UP' | 'WALK_TO_POI' | 'INSPECT_POI' | 'DANCE' | 'SPRINT_BACK' | 'SIT_DOWN'`
  - `interface RoamContext { status: AgentStatus; deskSeat: { x: number; y: number; z: number }; targetPoi: OfficePOI | null; ... }`
  - `createInitialRoamState(deskSeat): RoamState`
  - `stepRoamState(state: RoamState, ctx: RoamContext, dt: number): RoamOutput`
  - `RoamOutput: { position: [number, number, number]; rotationY: number; legPose: LegPose; isSeated: boolean; danceTorsoAngle: number }`

- [x] **Step 1: Write unit tests in `scripts/roam-rules.mjs` for state machine transitions**

```javascript
import { createInitialRoamState, stepRoamState } from '../src/lib/idleRoamState.ts';

// Initial state is SEATED at desk
const initial = createInitialRoamState({ x: 0, y: 0.4, z: -0.78 });
check('initial substate is SEATED', initial.subState, 'SEATED');

// Interruption test: if agent transitions to THINKING while walking, substate switches to SPRINT_BACK immediately
const walkingState = { ...initial, subState: 'WALK_TO_POI', position: [2, 0, 2] };
const stepped = stepRoamState(walkingState, { status: 'THINKING', deskSeat: { x: 0, y: 0.4, z: -0.78 } }, 0.05);
check('interruption during WALK_TO_POI forces SPRINT_BACK', stepped.nextState.subState, 'SPRINT_BACK');

// Sprint back increases speed
check('sprint speed is greater than walk speed', stepped.speed >= 3.0, true);
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm run roam:test`
Expected: FAIL (module `idleRoamState.ts` not found).

- [x] **Step 3: Implement `src/lib/idleRoamState.ts`**

Implement deterministic step logic:
- `SEATED`: count idle timer (4s–8s); when triggered, pick random POI or dance spot, switch to `STAND_UP`.
- `STAND_UP`: 0.8s duration. Interpolates root position from desk seat `y: 0.4, z: -0.78` down to floor `y: 0, z: -0.3`, unbending hips from `PI/2` to `0`.
- `WALK_TO_POI`: moves toward waypoint at 1.3 units/s. Drives walking sine wave: `hipL = sin(t)*0.45`, `hipR = -sin(t)*0.45`, `knee` flexes on backswing, torso bobs. Rotation faces velocity vector.
- `INSPECT_POI`: duration 4s–6s. Looks at object, tilts head, subtle idle breathing.
- `DANCE`: duration 6s. 120 BPM tempo: vertical bounce, alternating arm pumps, hip sway.
- `SPRINT_BACK`: fast return directly to `[0, 0, -0.3]` at 3.2 units/s. When within 0.05 units, switches to `SIT_DOWN`.
- `SIT_DOWN`: 0.6s duration. Reverses hips and knees back to `PI/2`, lifts root to `DESK_SEAT.y`. Returns to `SEATED`.
- Any non-IDLE status (`THINKING` / `STREAMING` / `ERROR`) while not `SEATED` immediately forces `SPRINT_BACK`.

- [x] **Step 4: Run test to verify it passes**

Run: `npm run roam:test`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/lib/idleRoamState.ts scripts/roam-rules.mjs
git commit -m "feat(roam): implement idle roaming state machine with gait kinematics and interruptions"
```

---

### Task 4: Integrate Roam Animation in `WorkerRobot.tsx`

**Files:**
- Modify: `src/components/canvas/WorkerRobot.tsx:1-362`

**Interfaces:**
- Consumes:
  - `stepRoamState`, `createInitialRoamState` from `src/lib/idleRoamState.ts`
  - `RobotLegs`, `applyLegPose` from `src/components/canvas/RobotLegs.tsx`
  - `worldToSlotLocal` from `src/lib/officePoints.ts`
  - `DESK_SEAT` from `src/components/canvas/WorkDesk.tsx`
- Produces:
  - `WorkerRobotProps` extended with optional `slotPosition?: [number, number, number]`, `slotRotationY?: number`, `onPositionChange?: (localPos: [number, number, number]) => void`

- [x] **Step 1: Write test/smoke assertion for WorkerRobot compilation**

Add test in `scripts/roam-rules.mjs` verifying that `WorkerRobot` exports properly and works with default props.

- [x] **Step 2: Run test to verify it passes**

Run: `npm run typecheck`

- [x] **Step 3: Update `WorkerRobot.tsx`**

1. Replace static `<RobotParts node="root" />` with `<RobotLegs ... />` using refs for hips, knees, feet.
2. In `useFrame`, instantiate and run `stepRoamState`.
3. When `CAPTURE_MODE` is true, freeze roam state at `SEATED`.
4. While roaming (`!output.isSeated`), drive `root.current.position` and `root.current.rotation.y` from `output.position` and `output.rotationY`.
5. Apply `output.legPose` to leg refs.
6. Arm swinging: during `WALK_TO_POI` / `SPRINT_BACK`, blend arm rotation opposite to legs; during `DANCE`, pump arms rhythmically; during `SEATED`, retain existing typing/glancing micro-animations.
7. Gating: suppress typing jitter and parcel emission in `RobotEffects` unless `output.isSeated === true`.
8. Notify `onPositionChange` with current local position if provided.

- [x] **Step 4: Run typecheck & lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS with 0 errors.

- [x] **Step 5: Commit**

```bash
git add src/components/canvas/WorkerRobot.tsx
git commit -m "feat(robot): wire articulated legs and idle roaming state machine into WorkerRobot"
```

---

### Task 5: Dynamic Camera, Selection Ring & Shadow Tracking in `Scene.tsx`

**Files:**
- Modify: `src/components/canvas/Scene.tsx:190-448, 620-710`

**Interfaces:**
- Consumes: Live robot position from `WorkerRobot`'s `onPositionChange` callback.
- Produces:
  - Floor selection ring moves to `[robotPos.x, 0.03, robotPos.z]`
  - Blob shadow moves to `[robotPos.x, 0, robotPos.z]`
  - `focusTarget` in `CameraRig` tracks the dynamic world coordinates of selected roaming robot

- [x] **Step 1: Check existing layout test passes prior to edit**

Run: `npm run layout:test`
Expected: PASS.

- [x] **Step 2: Update `AgentNode` in `Scene.tsx`**

1. Track `robotOffset = useRef<[number, number, number]>([0, DESK_SEAT.y, DESK_SEAT.z])`.
2. Pass `slotPosition={slot.position}` and `slotRotationY={slot.rotationY}` to `WorkerRobot`.
3. Put selection ring and robot blob shadow in a dynamic group or update their position refs from `robotOffset.current` in `useFrame`.
4. Update `agentPositionRegistry.set(id, currentWorldPosition)` so `CameraRig` reads the live position.
5. In `CameraRig`, when `preset === 'focus'`, smoothly track `focusTarget` to the active world position of `selectedAgentId`.

- [x] **Step 3: Run layout test and typecheck**

Run: `npm run layout:test && npm run typecheck`
Expected: PASS.

- [x] **Step 4: Commit**

```bash
git add src/components/canvas/Scene.tsx
git commit -m "feat(scene): track mobile robot with selection ring, shadow, and camera focus"
```

---

### Task 6: Visual Smoke & Verification

**Files:**
- Modify: `scripts/smoke.mjs` (if needed to add roam state checks)

- [x] **Step 1: Run complete test suite**

Run:
```bash
npm run typecheck
npm run lint
npm run status:test
npm run roam:test
npm run layout:test
npm run smoke
```
Expected: All pass.

- [x] **Step 2: Visual verification in dev server**

Run: `npm run dev`
Inspect in browser:
1. When idle, robot gets up from chair, legs straighten to floor.
2. Walks with articulated leg strides toward POIs (Whiteboard, Bookshelf, Plants, Hub rug).
3. Stops and inspects POI (head tilt, looking up/down).
4. Dances with hip sways, bounces, and arm pumps.
5. When status is set to THINKING or STREAMING (via HUD), robot immediately sprints back to desk, sits, folds legs, and starts typing.
6. Camera focus shot follows robot smoothly during roam.

- [x] **Step 3: Commit final polish**

```bash
git commit --allow-empty -m "chore(roam): verify idle roam locomotion and camera tracking"
```
