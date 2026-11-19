/**
 * Kinematic specifications and pose data structures for articulated robot legs.
 */

export const LEG_KINEMATICS = {
  hipPivotY: 0.2,
  hipPivotX: 0.17,
  thighLength: 0.4,
  shinLength: 0.4,
  footHeight: 0.12,
  standingRootY: 0.66,
  seatedRootY: 0.4,
  seatedHipAngle: Math.PI / 2,
  seatedKneeAngle: -Math.PI / 2,
} as const;

export interface LegPose {
  hipL: number;
  kneeL: number;
  footL?: number;
  hipR: number;
  kneeR: number;
  footR?: number;
}
