'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  ANTENNA_BALL,
  ROBOT_COLORS,
  ROBOT_PARTS,
  identityPartsFor,
  resolveRobotColor,
  type RobotNodeId,
  type RobotPart,
} from '@/lib/robotModel';
import type { ResolvedIdentity } from '@/lib/providerIdentity';
import type { AgentStatus } from '@/lib/types';

export interface RobotPartsProps {
  /** Which node's blocks to render. */
  node: RobotNodeId;
  /**
   * The agent's identity, or `null` for the shared body only.
   *
   * `null` is what the antenna group passes: it renders the stalk itself and
   * lets `<AntennaTopper>` own whatever sits on top.
   */
  identity: ResolvedIdentity | null;
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
export function RobotParts({ node, identity, accent }: RobotPartsProps) {
  const parts = useMemo(() => {
    const base = ROBOT_PARTS_FOR_NODE(node);
    if (!identity) return base;
    return [...base, ...identityPartsFor(identity).filter((part) => part.node === node)];
  }, [identity, node]);

  return (
    <>
      {parts.map((part) => (
        <RobotPartMesh key={part.id} part={part} accent={accent} identity={identity} />
      ))}
    </>
  );
}

/**
 * Only the identity's own blocks — shells, topper, emblem — for one node.
 *
 * Used where the shared body is already present: the `.glb` joints carry the
 * baked `ROBOT_PARTS`, so mounting those again would double every block.
 */
export function RobotIdentityParts({
  node,
  identity,
  accent,
}: {
  node: RobotNodeId;
  identity: ResolvedIdentity;
  accent: string;
}) {
  const parts = useMemo(
    () => identityPartsFor(identity).filter((part) => part.node === node),
    [identity, node],
  );

  return (
    <>
      {parts.map((part) => (
        <RobotPartMesh key={part.id} part={part} accent={accent} identity={identity} />
      ))}
    </>
  );
}

/** `ROBOT_PARTS` filtered to one node, memoised per node by the caller. */
function ROBOT_PARTS_FOR_NODE(node: RobotNodeId): RobotPart[] {
  return ROBOT_PARTS.filter((part) => part.node === node);
}

function RobotPartMesh({
  part,
  accent,
  identity,
}: {
  part: RobotPart;
  accent: string;
  identity: ResolvedIdentity | null;
}) {
  // `accent2` is the identity's second brand colour. Parts that ask for it get
  // it here, which is what keeps the brand palette in one table instead of
  // sprinkling hex literals through the shape spec.
  const partAccent = part.color === 'accent2' ? (identity?.accent2 ?? accent) : accent;
  const color = resolveRobotColor(part.color, partAccent);
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

/**
 * What sits on the antenna: the original yellow ball for the default identity,
 * or the provider's own topper.
 *
 * The ball used to be animated by a ref inside `WorkerRobot`. The pulse now
 * lives on this wrapper group so it applies to every topper, which is what keeps
 * a provider bot feeling alive exactly where the default ball did. The numbers
 * are the ones the ball used before this component existed.
 */
export function AntennaTopper({
  identity,
  status,
}: {
  identity: ResolvedIdentity;
  status: AgentStatus;
}) {
  const group = useRef<THREE.Group>(null);
  const isError = status === 'ERROR';

  useFrame((state) => {
    if (!group.current) return;
    const t = state.clock.elapsedTime;
    const s = 1 + Math.sin(t * (isError ? 12 : 2.6)) * (isError ? 0.18 : 0.07);
    group.current.scale.setScalar(s);
  });

  return (
    <group ref={group} userData={{ topperPulse: true }}>
      {identity.topper === 'ball' ? (
        <mesh name="antennaBall" position={ANTENNA_BALL.position}>
          <sphereGeometry
            args={[ANTENNA_BALL.radius, ANTENNA_BALL.segments, ANTENNA_BALL.segments]}
          />
          <meshLambertMaterial color={ROBOT_COLORS.yellow} />
        </mesh>
      ) : (
        <RobotIdentityParts node="antenna" identity={identity} accent={identity.color} />
      )}
    </group>
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
