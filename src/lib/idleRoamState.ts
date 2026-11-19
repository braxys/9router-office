/**
 * Pure state machine and kinematic calculator for idle robot roaming.
 */

import type { AgentStatus } from './types';
import type { OfficePOI } from './officePoints';
import type { LegPose } from './robotLegsModel';

export type RoamSubState =
  | 'SEATED'
  | 'STAND_UP'
  | 'WALK_TO_POI'
  | 'INSPECT_POI'
  | 'DANCE'
  | 'SPRINT_BACK'
  | 'SIT_DOWN';

export interface RoamState {
  subState: RoamSubState;
  /** Current local position [x, y, z]. */
  position: [number, number, number];
  /** Current local Y rotation (facing angle) in radians. */
  rotationY: number;
  /** Target waypoint in slot local coordinates. */
  targetLocal: [number, number, number];
  /** Currently visited POI. */
  currentPoi: OfficePOI | null;
  /** Generic sub-state timer. */
  timer: number;
  /** Walk / gait animation cycle phase. */
  walkPhase: number;
  /** Dance rhythm phase. */
  dancePhase: number;
  /** Random delay until next roam starts. */
  nextRoamDelay: number;
}

export interface RoamContext {
  status: AgentStatus;
  deskSeat: { x: number; y: number; z: number };
  targetPoi: OfficePOI | null;
  slotPos: readonly [number, number, number];
  slotRotY: number;
  /** Optional POI selector callback. */
  pickPoi?: (currentId: string | null, seed: number) => OfficePOI;
  /** Optional world-to-local mapper. */
  worldToLocal?: (
    worldPos: readonly [number, number, number],
    slotPos: readonly [number, number, number],
    slotRotY: number,
  ) => [number, number, number];
  /** Seed for deterministic pseudo-random variation. */
  seed?: number;
}

export interface RoamOutput {
  nextState: RoamState;
  position: [number, number, number];
  rotationY: number;
  legPose: LegPose;
  armSwingL: number;
  armSwingR: number;
  torsoTiltZ: number;
  isSeated: boolean;
  speed: number;
}

export const ROAM_KINEMATICS = {
  standingRootY: 0.72,
  seatedRootY: 0.4,
  seatedHipAngle: -Math.PI / 2,
  seatedKneeAngle: Math.PI / 2,
  tStand: 0.8,
  tSit: 0.6,
  walkSpeed: 1.35,
  sprintSpeed: 3.2,
  deskEntryZ: -0.65,
} as const;

/**
 * Creates the initial SEATED roam state.
 */
export function createInitialRoamState(deskSeat: {
  x: number;
  y: number;
  z: number;
}): RoamState {
  return {
    subState: 'SEATED',
    position: [0, deskSeat.y, deskSeat.z],
    rotationY: 0,
    targetLocal: [0, ROAM_KINEMATICS.standingRootY, ROAM_KINEMATICS.deskEntryZ],
    currentPoi: null,
    timer: 0,
    walkPhase: 0,
    dancePhase: 0,
    nextRoamDelay: 4.5,
  };
}

/**
 * Default slot local projection fallback if callback omitted.
 */
function defaultWorldToSlotLocal(
  worldPos: readonly [number, number, number],
  slotPos: readonly [number, number, number],
  slotRotY: number,
): [number, number, number] {
  const dx = worldPos[0] - slotPos[0];
  const dy = worldPos[1] - slotPos[1];
  const dz = worldPos[2] - slotPos[2];

  const cos = Math.cos(-slotRotY);
  const sin = Math.sin(-slotRotY);

  return [dx * cos + dz * sin, dy, -dx * sin + dz * cos];
}

/**
 * Step calculation for the roaming state machine.
 */
export function stepRoamState(
  state: RoamState,
  ctx: RoamContext,
  dt: number,
): RoamOutput {
  const { status, deskSeat, slotPos, slotRotY } = ctx;
  const isWorking = status !== 'IDLE';

  let subState = state.subState;
  let timer = state.timer + dt;
  let walkPhase = state.walkPhase;
  let dancePhase = state.dancePhase;
  let position: [number, number, number] = [...state.position];
  let rotationY = state.rotationY;
  let targetLocal = state.targetLocal;
  let currentPoi = state.currentPoi;
  let nextRoamDelay = state.nextRoamDelay;

  let speed = 0;
  let legPose: LegPose = {
    hipL: ROAM_KINEMATICS.seatedHipAngle,
    kneeL: ROAM_KINEMATICS.seatedKneeAngle,
    hipR: ROAM_KINEMATICS.seatedHipAngle,
    kneeR: ROAM_KINEMATICS.seatedKneeAngle,
  };
  let armSwingL = 0;
  let armSwingR = 0;
  let torsoTiltZ = 0;

  const deskEntry: [number, number, number] = [
    0,
    ROAM_KINEMATICS.standingRootY,
    ROAM_KINEMATICS.deskEntryZ,
  ];

  // Interruption handling
  if (isWorking && subState !== 'SEATED' && subState !== 'SIT_DOWN') {
    if (subState === 'STAND_UP') {
      subState = 'SIT_DOWN';
      timer = (1 - Math.min(1, timer / ROAM_KINEMATICS.tStand)) * ROAM_KINEMATICS.tSit;
    } else {
      subState = 'SPRINT_BACK';
      targetLocal = deskEntry;
    }
  }

  switch (subState) {
    case 'SEATED': {
      position = [0, deskSeat.y, deskSeat.z];
      rotationY = 0;
      legPose = {
        hipL: ROAM_KINEMATICS.seatedHipAngle,
        kneeL: ROAM_KINEMATICS.seatedKneeAngle,
        hipR: ROAM_KINEMATICS.seatedHipAngle,
        kneeR: ROAM_KINEMATICS.seatedKneeAngle,
      };

      if (!isWorking && timer >= nextRoamDelay) {
        subState = 'STAND_UP';
        const seed = Math.floor((ctx.seed ?? 1) * 1000 + timer);
        timer = 0;
        const poi =
          ctx.targetPoi ??
          (ctx.pickPoi ? ctx.pickPoi(currentPoi?.id ?? null, seed) : null);
        currentPoi = poi;
        if (poi) {
          const toLocal = ctx.worldToLocal ?? defaultWorldToSlotLocal;
          targetLocal = toLocal(poi.worldPos, slotPos, slotRotY);
        }
      }
      break;
    }

    case 'STAND_UP': {
      const p = Math.min(1, timer / ROAM_KINEMATICS.tStand);
      const tSmooth = p * p * (3 - 2 * p);

      position[0] = 0;
      position[1] =
        deskSeat.y + (ROAM_KINEMATICS.standingRootY - deskSeat.y) * tSmooth;
      position[2] = deskSeat.z + (ROAM_KINEMATICS.deskEntryZ - deskSeat.z) * tSmooth;

      const hipAngle = ROAM_KINEMATICS.seatedHipAngle * (1 - tSmooth);
      const kneeAngle = ROAM_KINEMATICS.seatedKneeAngle * (1 - tSmooth);

      legPose = {
        hipL: hipAngle,
        kneeL: kneeAngle,
        hipR: hipAngle,
        kneeR: kneeAngle,
      };

      if (p >= 1) {
        subState = 'WALK_TO_POI';
        timer = 0;
      }
      break;
    }

    case 'WALK_TO_POI': {
      speed = ROAM_KINEMATICS.walkSpeed;
      const dx = targetLocal[0] - position[0];
      const dz = targetLocal[2] - position[2];
      const dist = Math.hypot(dx, dz);

      if (dist > 0.001) {
        const targetAngle = Math.atan2(dx, dz);
        const angleDiff = Math.atan2(
          Math.sin(targetAngle - rotationY),
          Math.cos(targetAngle - rotationY),
        );
        rotationY += angleDiff * Math.min(1, dt * 8);

        const moveStep = Math.min(dist, speed * dt);
        position[0] += (dx / dist) * moveStep;
        position[2] += (dz / dist) * moveStep;
      }

      walkPhase += dt * speed * 5.5;
      const stride = Math.sin(walkPhase) * 0.45;
      legPose = {
        hipL: stride,
        kneeL: Math.max(0, -stride) * 0.65,
        hipR: -stride,
        kneeR: Math.max(0, stride) * 0.65,
      };
      armSwingL = -stride * 0.7;
      armSwingR = stride * 0.7;
      position[1] =
        ROAM_KINEMATICS.standingRootY + Math.abs(Math.sin(walkPhase)) * 0.04;

      if (dist <= 0.28) {
        timer = 0;
        if (currentPoi?.activity === 'dance') {
          subState = 'DANCE';
        } else {
          subState = 'INSPECT_POI';
        }
      }
      break;
    }

    case 'INSPECT_POI': {
      speed = 0;
      position[1] = ROAM_KINEMATICS.standingRootY;
      legPose = { hipL: 0, kneeL: 0, hipR: 0, kneeR: 0 };

      // Orient toward POI lookAt target if available
      if (currentPoi) {
        const toLocal = ctx.worldToLocal ?? defaultWorldToSlotLocal;
        const lookLocal = toLocal(currentPoi.lookAtPos, slotPos, slotRotY);
        const dxLook = lookLocal[0] - position[0];
        const dzLook = lookLocal[2] - position[2];
        if (Math.hypot(dxLook, dzLook) > 0.1) {
          const targetAngle = Math.atan2(dxLook, dzLook);
          const angleDiff = Math.atan2(
            Math.sin(targetAngle - rotationY),
            Math.cos(targetAngle - rotationY),
          );
          rotationY += angleDiff * Math.min(1, dt * 6);
        }
      }

      const sway = Math.sin(timer * 1.8) * 0.04;
      torsoTiltZ = sway;

      const duration = currentPoi?.durationS ?? 4.5;
      if (timer >= duration) {
        subState = 'SPRINT_BACK';
        timer = 0;
        targetLocal = deskEntry;
      }
      break;
    }

    case 'DANCE': {
      speed = 0;
      dancePhase += dt * Math.PI * 3.8;
      const bounce = Math.abs(Math.sin(dancePhase)) * 0.07;
      position[1] = ROAM_KINEMATICS.standingRootY + bounce;

      torsoTiltZ = Math.sin(dancePhase * 0.5) * 0.12;
      armSwingL = Math.sin(dancePhase) * 0.55;
      armSwingR = -Math.sin(dancePhase) * 0.55;

      const kneeFlex = Math.abs(Math.sin(dancePhase)) * 0.25;
      legPose = {
        hipL: Math.sin(dancePhase * 0.5) * 0.1,
        kneeL: kneeFlex,
        hipR: -Math.sin(dancePhase * 0.5) * 0.1,
        kneeR: kneeFlex,
      };

      const duration = currentPoi?.durationS ?? 5.5;
      if (timer >= duration) {
        subState = 'SPRINT_BACK';
        timer = 0;
        targetLocal = deskEntry;
      }
      break;
    }

    case 'SPRINT_BACK': {
      speed = ROAM_KINEMATICS.sprintSpeed;
      targetLocal = deskEntry;
      const dx = targetLocal[0] - position[0];
      const dz = targetLocal[2] - position[2];
      const dist = Math.hypot(dx, dz);

      if (dist > 0.001) {
        const targetAngle = Math.atan2(dx, dz);
        const angleDiff = Math.atan2(
          Math.sin(targetAngle - rotationY),
          Math.cos(targetAngle - rotationY),
        );
        rotationY += angleDiff * Math.min(1, dt * 10);

        const moveStep = Math.min(dist, speed * dt);
        position[0] += (dx / dist) * moveStep;
        position[2] += (dz / dist) * moveStep;
      }

      walkPhase += dt * speed * 5.0;
      const stride = Math.sin(walkPhase) * 0.5;
      legPose = {
        hipL: stride,
        kneeL: Math.max(0, -stride) * 0.75,
        hipR: -stride,
        kneeR: Math.max(0, stride) * 0.75,
      };
      armSwingL = -stride * 0.8;
      armSwingR = stride * 0.8;
      position[1] =
        ROAM_KINEMATICS.standingRootY + Math.abs(Math.sin(walkPhase)) * 0.05;

      if (dist <= 0.18) {
        subState = 'SIT_DOWN';
        timer = 0;
      }
      break;
    }

    case 'SIT_DOWN': {
      const p = Math.min(1, timer / ROAM_KINEMATICS.tSit);
      const tSmooth = p * p * (3 - 2 * p);

      position[0] = position[0] * (1 - Math.min(1, dt * 12));
      position[1] =
        ROAM_KINEMATICS.standingRootY +
        (deskSeat.y - ROAM_KINEMATICS.standingRootY) * tSmooth;
      position[2] =
        ROAM_KINEMATICS.deskEntryZ +
        (deskSeat.z - ROAM_KINEMATICS.deskEntryZ) * tSmooth;

      rotationY = rotationY * (1 - Math.min(1, dt * 8));

      const hipAngle = ROAM_KINEMATICS.seatedHipAngle * tSmooth;
      const kneeAngle = ROAM_KINEMATICS.seatedKneeAngle * tSmooth;

      legPose = {
        hipL: hipAngle,
        kneeL: kneeAngle,
        hipR: hipAngle,
        kneeR: kneeAngle,
      };

      if (p >= 1) {
        subState = 'SEATED';
        timer = 0;
        nextRoamDelay = 5.0 + Math.random() * 4.0;
      }
      break;
    }
  }

  const isSeated = subState === 'SEATED';

  return {
    nextState: {
      subState,
      position,
      rotationY,
      targetLocal,
      currentPoi,
      timer,
      walkPhase,
      dancePhase,
      nextRoamDelay,
    },
    position,
    rotationY,
    legPose,
    armSwingL,
    armSwingR,
    torsoTiltZ,
    isSeated,
    speed,
  };
}
