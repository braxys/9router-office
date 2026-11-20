'use client';

import type { RefObject } from 'react';
import * as THREE from 'three';
import { ROBOT_COLORS, resolveRobotColor, type RobotPalette } from '@/lib/robotModel';
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
  /**
   * The identity's four brand roles, so the legs wear the same colours the
   * spec assigns them: thigh `limb`, shin `extra`, foot `cream`.
   *
   * Without this the legs fall back to `darkenHex(accent)` and ignore a
   * provider's declared `limb`/`extra` hexes — a four-colour logo would show
   * two colours on its legs.
   */
  palette?: RobotPalette;
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
  palette,
}: RobotLegsProps) {
  const { hipPivotX, hipPivotY, thighLength, shinLength, footHeight } = LEG_KINEMATICS;
  // The same three roles `ROBOT_PARTS` declares for these six meshes. Resolved
  // once per render rather than per mesh, and through the identity palette so a
  // provider's real brand colours reach the legs.
  const thighColor = resolveRobotColor('limb', accent, palette);
  const shinColor = resolveRobotColor('extra', accent, palette);
  const footColor = ROBOT_COLORS.cream;

  return (
    <>
      {/* ---------- LEFT LEG ---------- */}
      <group ref={hipLRef} position={[-hipPivotX, hipPivotY, 0]}>
        {/* Thigh: drops along -Y from hip pivot */}
        <mesh name="thighL" position={[0, -thighLength / 2, 0]}>
          <boxGeometry args={[0.2, thighLength, 0.2]} />
          <meshLambertMaterial color={thighColor} />
        </mesh>

        {/* Knee joint at bottom of thigh */}
        <group ref={kneeLRef} position={[0, -thighLength, 0]}>
          {/* Shin: drops along -Y from knee pivot */}
          <mesh name="shinL" position={[0, -shinLength / 2, 0]}>
            <boxGeometry args={[0.18, shinLength, 0.18]} />
            <meshLambertMaterial color={shinColor} />
          </mesh>

          {/* Foot: flat at bottom of shin */}
          <mesh ref={footLRef} name="footL" position={[0, -shinLength - footHeight / 2, 0.05]}>
            <boxGeometry args={[0.21, footHeight, 0.28]} />
            <meshLambertMaterial color={footColor} />
          </mesh>
        </group>
      </group>

      {/* ---------- RIGHT LEG ---------- */}
      <group ref={hipRRef} position={[hipPivotX, hipPivotY, 0]}>
        {/* Thigh: drops along -Y from hip pivot */}
        <mesh name="thighR" position={[0, -thighLength / 2, 0]}>
          <boxGeometry args={[0.2, thighLength, 0.2]} />
          <meshLambertMaterial color={thighColor} />
        </mesh>

        {/* Knee joint at bottom of thigh */}
        <group ref={kneeRRef} position={[0, -thighLength, 0]}>
          {/* Shin: drops along -Y from knee pivot */}
          <mesh name="shinR" position={[0, -shinLength / 2, 0]}>
            <boxGeometry args={[0.18, shinLength, 0.18]} />
            <meshLambertMaterial color={shinColor} />
          </mesh>

          {/* Foot: flat at bottom of shin */}
          <mesh ref={footRRef} name="footR" position={[0, -shinLength - footHeight / 2, 0.05]}>
            <boxGeometry args={[0.21, footHeight, 0.28]} />
            <meshLambertMaterial color={footColor} />
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
