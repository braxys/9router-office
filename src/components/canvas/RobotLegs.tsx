'use client';

import type { RefObject } from 'react';
import * as THREE from 'three';
import { ROBOT_COLORS, resolveRobotColor } from '@/lib/robotModel';
import { LEG_KINEMATICS, type LegPose } from '@/lib/robotLegsModel';

export { LEG_KINEMATICS, type LegPose };

export interface RobotLegsProps {
  hipLRef: RefObject<THREE.Group | null>;
  kneeLRef: RefObject<THREE.Group | null>;
  footLRef?: RefObject<THREE.Mesh | null>;
  hipRRef: RefObject<THREE.Group | null>;
  kneeRRef: RefObject<THREE.Group | null>;
  footRRef?: RefObject<THREE.Mesh | null>;
  accent: string;
}

/**
 * Procedural articulated legs for the worker robot.
 * Supports both seated pose (hip +90°, knee -90°) and dynamic walking/dancing poses.
 */
export function RobotLegs({
  hipLRef,
  kneeLRef,
  footLRef,
  hipRRef,
  kneeRRef,
  footRRef,
  accent,
}: RobotLegsProps) {
  const { hipPivotX, hipPivotY, thighLength, shinLength, footHeight } = LEG_KINEMATICS;
  const limbColor = resolveRobotColor('limb', accent);

  return (
    <>
      {/* ---------- LEFT LEG ---------- */}
      <group ref={hipLRef} position={[-hipPivotX, hipPivotY, 0]}>
        {/* Thigh: drops along -Y from hip pivot */}
        <mesh position={[0, -thighLength / 2, 0]}>
          <boxGeometry args={[0.2, thighLength, 0.2]} />
          <meshLambertMaterial color={limbColor} />
        </mesh>

        {/* Knee joint at bottom of thigh */}
        <group ref={kneeLRef} position={[0, -thighLength, 0]}>
          {/* Shin: drops along -Y from knee pivot */}
          <mesh position={[0, -shinLength / 2, 0]}>
            <boxGeometry args={[0.18, shinLength, 0.18]} />
            <meshLambertMaterial color={limbColor} />
          </mesh>

          {/* Foot: flat at bottom of shin */}
          <mesh ref={footLRef} position={[0, -shinLength - footHeight / 2, 0.05]}>
            <boxGeometry args={[0.21, footHeight, 0.28]} />
            <meshLambertMaterial color={ROBOT_COLORS.cream} />
          </mesh>
        </group>
      </group>

      {/* ---------- RIGHT LEG ---------- */}
      <group ref={hipRRef} position={[hipPivotX, hipPivotY, 0]}>
        {/* Thigh: drops along -Y from hip pivot */}
        <mesh position={[0, -thighLength / 2, 0]}>
          <boxGeometry args={[0.2, thighLength, 0.2]} />
          <meshLambertMaterial color={limbColor} />
        </mesh>

        {/* Knee joint at bottom of thigh */}
        <group ref={kneeRRef} position={[0, -thighLength, 0]}>
          {/* Shin: drops along -Y from knee pivot */}
          <mesh position={[0, -shinLength / 2, 0]}>
            <boxGeometry args={[0.18, shinLength, 0.18]} />
            <meshLambertMaterial color={limbColor} />
          </mesh>

          {/* Foot: flat at bottom of shin */}
          <mesh ref={footRRef} position={[0, -shinLength - footHeight / 2, 0.05]}>
            <boxGeometry args={[0.21, footHeight, 0.28]} />
            <meshLambertMaterial color={ROBOT_COLORS.cream} />
          </mesh>
        </group>
      </group>
    </>
  );
}

/**
 * Applies Euler X rotations directly to leg joints.
 */
export function applyLegPose(
  refs: {
    hipL: THREE.Group | null;
    kneeL: THREE.Group | null;
    hipR: THREE.Group | null;
    kneeR: THREE.Group | null;
  },
  pose: LegPose,
) {
  if (refs.hipL) refs.hipL.rotation.x = pose.hipL;
  if (refs.kneeL) refs.kneeL.rotation.x = pose.kneeL;
  if (refs.hipR) refs.hipR.rotation.x = pose.hipR;
  if (refs.kneeR) refs.kneeR.rotation.x = pose.kneeR;
}
