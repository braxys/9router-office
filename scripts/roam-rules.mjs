/**
 * Tests for office POIs, coordinate conversions, and roaming kinematics.
 *
 *   npm run roam:test
 */
import {
  OFFICE_POIS,
  worldToSlotLocal,
  slotLocalToWorld,
  pickNextPoi,
} from '../src/lib/officePoints.ts';

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

console.log('\n--- Task 1: POI Registry and Coordinate Conversion ---\n');

// 1. POIs must be defined and stay in unoccluded room zones (x < 7.0)
check('OFFICE_POIS has at least 5 points', OFFICE_POIS.length >= 5, true);
check('all POIs stay clear of right sidebar x < 7.0', OFFICE_POIS.every((p) => p.worldPos[0] < 7.0), true);

// 2. Coordinate conversions
const slotPos = [3.8, 0, 0];
const slotRotY = -Math.PI / 2;
const worldTarget = [0, 0, 0];
const local = worldToSlotLocal(worldTarget, slotPos, slotRotY);
const backToWorld = slotLocalToWorld(local, slotPos, slotRotY);

const errorDist = Math.hypot(backToWorld[0] - worldTarget[0], backToWorld[2] - worldTarget[2]);
check('world -> slotLocal -> world preserves coordinate accurately', errorDist < 0.001, true);

// 3. POI selection alternates
const p1 = pickNextPoi(null, 123);
const p2 = pickNextPoi(p1.id, 124);
check('pickNextPoi selects valid POI', typeof p1.id === 'string' && p1.worldPos.length === 3, true);
check('pickNextPoi does not repeat previous POI', p1.id !== p2.id, true);

console.log('\n--- Task 2: Articulated Legs Geometry & Kinematics ---\n');
import { LEG_KINEMATICS } from '../src/lib/robotLegsModel.ts';

check('LEG_KINEMATICS.standingRootY is defined and positive', LEG_KINEMATICS.standingRootY > 0.5, true);
check('LEG_KINEMATICS.hipPivotY is 0.2', LEG_KINEMATICS.hipPivotY, 0.2);
check('LEG_KINEMATICS.seatedHipAngle is PI / 2', Math.abs(LEG_KINEMATICS.seatedHipAngle - Math.PI / 2) < 0.001, true);

console.log('\n--- Task 3: Idle Roam State Machine ---\n');
import {
  createInitialRoamState,
  stepRoamState,
} from '../src/lib/idleRoamState.ts';

const deskSeat = { x: 0, y: 0.4, z: -0.78 };
const s0 = createInitialRoamState(deskSeat);
check('initial state subState is SEATED', s0.subState, 'SEATED');

const out0 = stepRoamState(s0, {
  status: 'IDLE',
  deskSeat,
  targetPoi: null,
  slotPos: [0, 0, 0],
  slotRotY: 0,
}, 0.05);
check('initial step output isSeated is true', out0.isSeated, true);

// Test interruption: if status transitions to THINKING while state is WALK_TO_POI
const walkingState = {
  ...s0,
  subState: 'WALK_TO_POI',
  position: [2.0, LEG_KINEMATICS.standingRootY, 2.0],
  targetLocal: [5.0, 0, 5.0],
};
const interrupted = stepRoamState(walkingState, {
  status: 'THINKING',
  deskSeat,
  targetPoi: null,
  slotPos: [0, 0, 0],
  slotRotY: 0,
}, 0.05);

check('interruption during WALK_TO_POI switches subState to SPRINT_BACK', interrupted.nextState.subState, 'SPRINT_BACK');
check('sprint speed is >= 3.0', interrupted.speed >= 3.0, true);



if (failures > 0) {
  console.error(`\n${failures} of ${total} checks failed.\n`);
  process.exit(1);
} else {
  console.log(`\nAll ${total} checks passed.\n`);
}
