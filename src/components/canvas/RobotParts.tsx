'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import {
  ROBOT_COLORS,
  ROBOT_PARTS,
  resolveRobotColor,
  type RobotNodeId,
  type RobotPart,
} from '@/lib/robotModel';

export interface RobotPartsProps {
  /** Which node's blocks to render. */
  node: RobotNodeId;
  /** The agent's accent colour; resolves the `body` / `limb` / `accent` palette keys. */
  accent: string;
}

/**
 * Renders every static block attached to one robot node, straight from the part
 * spec in `src/lib/robotModel.ts`.
 *
 * This is the only place the procedural robot's rigid geometry is defined, so a
 * shape tweak is a one-number edit in the spec — the same edit that regenerates
 * `public/models/worker-robot.glb`.
 *
 * Runtime-driven geometry (eyes, mouth, hands, antenna ball) is deliberately NOT
 * rendered here: the animation rig needs refs to those meshes.
 */
export function RobotParts({ node, accent }: RobotPartsProps) {
  const parts = useMemo(() => ROBOT_PARTS.filter((part) => part.node === node), [node]);

  return (
    <>
      {parts.map((part) => (
        <RobotPartMesh key={part.id} part={part} accent={accent} />
      ))}
    </>
  );
}

function RobotPartMesh({ part, accent }: { part: RobotPart; accent: string }) {
  const color = resolveRobotColor(part.color, accent);
  // Cylinders and spheres are specified by size in the spec so bounds maths stays
  // uniform; here they get their real primitive arguments.
  const rotation = part.rotation
    ? ([part.rotation[0], part.rotation[1], part.rotation[2]] as const)
    : undefined;

  return (
    <mesh name={part.id} position={part.position} rotation={rotation}>
      {part.shape === 'box' && (
        <boxGeometry args={[part.size[0], part.size[1], part.size[2]]} />
      )}
      {part.shape === 'cylinder' && (
        <cylinderGeometry
          args={[
            part.radiusTop ?? part.size[0] / 2,
            part.radiusBottom ?? part.size[0] / 2,
            part.size[1],
            part.segments ?? 10,
          ]}
        />
      )}
      {part.shape === 'sphere' && (
        <sphereGeometry
          args={[part.size[0] / 2, part.segments ?? 14, part.segments ?? 14]}
        />
      )}
      {part.unlit ? (
        <meshBasicMaterial color={color} />
      ) : (
        <meshLambertMaterial color={color} />
      )}
    </mesh>
  );
}

/** Re-exported so the rig keeps a single import site for palette lookups. */
export function useRobotPalette(accent: string) {
  return useMemo(
    () => ({
      body: resolveRobotColor('body', accent),
      limb: resolveRobotColor('limb', accent),
      cream: ROBOT_COLORS.cream,
      ink: ROBOT_COLORS.ink,
      blush: ROBOT_COLORS.blush,
      pink: ROBOT_COLORS.pink,
      pinkDeep: ROBOT_COLORS.pinkDeep,
      metal: ROBOT_COLORS.metal,
      white: ROBOT_COLORS.white,
      yellow: ROBOT_COLORS.yellow,
    }),
    [accent],
  );
}

/** Convenience for callers that only need the darkened limb shade. */
export function limbColorFor(accent: string): string {
  return resolveRobotColor('limb', accent);
}

/** Three.js colour helper kept out of render for the `react-hooks/purity` rule. */
export function hexToColor(hex: string): THREE.Color {
  return new THREE.Color(hex);
}
