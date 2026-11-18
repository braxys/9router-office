'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { AgentStatus } from '@/lib/types';
import { createSeededRandom } from '@/lib/random';

/**
 * The robot's per-status comedy, kept separate from its body.
 *
 * These props belong to the *performance*, not the character, so both render
 * paths use them: the procedural rig (`WorkerRobot.tsx`) and the opt-in `.glb`
 * model (`ModelRobot.tsx`). Opting into a model file therefore never silently
 * deletes the lightbulb, smoke or parcels.
 *
 * Everything here is anchored in the robot's root space — the same space
 * `DESK_SEAT` positions, so the props land correctly for either body.
 */

/** Parcel palette — hoisted so the stream keeps one stable data array. */
const PARCEL_COLORS = ['#ff8fa3', '#ffc94d', '#58d6a9', '#5cb8f2', '#b98bff'];

/** Springy ease that overshoots slightly — gives everything a toy feel. */
function spring(current: number, target: number, dt: number, stiffness = 9) {
  return current + (target - current) * Math.min(1, dt * stiffness);
}

/* -------------------------------------------------------------------------- */
/*  Floating state props                                                      */
/* -------------------------------------------------------------------------- */

/** Bouncing yellow lightbulb shown while THINKING. */
export function ThoughtBulb({ visible }: { visible: boolean }) {
  const root = useRef<THREE.Group>(null);

  useFrame((state, delta) => {
    if (!root.current) return;
    const dt = Math.min(delta, 0.05);
    const t = state.clock.elapsedTime;
    const target = visible ? 1 : 0;
    root.current.scale.x = spring(root.current.scale.x, target, dt, 10);
    root.current.scale.y = root.current.scale.x;
    root.current.scale.z = root.current.scale.x;
    root.current.position.y = 1.95 + Math.abs(Math.sin(t * 2.6)) * 0.16;
    root.current.rotation.z = Math.sin(t * 1.8) * 0.16;
  });

  return (
    <group ref={root} position={[0, 1.95, 0.1]} scale={0.001}>
      {/* bulb */}
      <mesh>
        <boxGeometry args={[0.22, 0.22, 0.22]} />
        <meshLambertMaterial color="#ffd93d" emissive="#ffc94d" emissiveIntensity={0.35} />
      </mesh>
      {/* filament hint */}
      <mesh position={[0, 0, 0.115]}>
        <boxGeometry args={[0.08, 0.08, 0.02]} />
        <meshBasicMaterial color="#fff3b0" />
      </mesh>
      {/* screw base */}
      <mesh position={[0, -0.15, 0]}>
        <boxGeometry args={[0.1, 0.09, 0.1]} />
        <meshLambertMaterial color="#c9d6e0" />
      </mesh>
      {/* rays */}
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return (
          <mesh
            key={i}
            position={[Math.cos(a) * 0.22, Math.sin(a) * 0.22, 0]}
            rotation={[0, 0, a]}
          >
            <boxGeometry args={[0.07, 0.02, 0.02]} />
            <meshBasicMaterial color="#ffc94d" />
          </mesh>
        );
      })}
    </group>
  );
}

/** Cartoon smoke puffs rising off a smoking monitor. */
export function SmokePuffs({ visible }: { visible: boolean }) {
  const root = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!root.current) return;
    const t = state.clock.elapsedTime;
    root.current.visible = visible;
    if (!visible) return;
    root.current.children.forEach((child, i) => {
      const phase = (t * 0.55 + i * 0.33) % 1;
      child.position.y = 0.15 + phase * 0.9;
      child.position.x = Math.sin(phase * 4 + i) * 0.16;
      child.scale.setScalar(0.09 + phase * 0.22);
      const mesh = child as THREE.Mesh;
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.75 * (1 - phase);
    });
  });

  return (
    <group ref={root} position={[0, 0, 0]}>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color="#b9c3cc" transparent opacity={0.6} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/*  Confetti / parcel launcher                                                */
/* -------------------------------------------------------------------------- */

function ParcelStream({
  active,
  colors,
  towardHub,
  tokensPerSecond,
}: {
  active: boolean;
  colors: string[];
  towardHub: [number, number];
  tokensPerSecond: number;
}) {
  const group = useRef<THREE.Group>(null);
  const travel = useRef(0);
  const clock = useRef(0);
  const data = useMemo(() => {
    const rand = createSeededRandom(0xbeef);
    return Array.from({ length: 10 }, (_, i) => ({
      offset: i / 10,
      drift: (rand() - 0.5) * 0.9,
      size: 0.1 + rand() * 0.06,
      color: colors[i % colors.length],
      arc: 0.6 + rand() * 0.5,
      spin: 1.2 + rand() * 2,
    }));
  }, [colors]);

  // A trickle shows two parcels; a full 135 tok/s stream fills all ten.
  const visibleCount = Math.min(10, Math.max(2, Math.ceil(tokensPerSecond / 15)));
  // Higher throughput also pushes each parcel along the arc faster.
  const pace = 1 + Math.min(1.5, tokensPerSecond / 90);

  useFrame((_, delta) => {
    if (!group.current) return;
    group.current.visible = active;
    if (!active) return;

    const dt = Math.min(delta, 0.05);
    clock.current += dt;
    travel.current = (travel.current + dt * 0.5 * pace) % 1;
    const t = travel.current;

    // Perpendicular in the XZ plane, so parcels fan out sideways.
    const px = -towardHub[1];
    const pz = towardHub[0];
    group.current.children.forEach((child, i) => {
      const p = data[i];
      child.visible = i < visibleCount;
      if (!child.visible) return;
      const phase = (t + p.offset) % 1;
      const dist = 1.0 + phase * 3.6;
      // Travel from the robot's hands toward the central hub.
      child.position.set(
        towardHub[0] * dist + px * p.drift * phase,
        1.15 + Math.sin(phase * Math.PI) * p.arc,
        towardHub[1] * dist + pz * p.drift * phase,
      );
      child.rotation.x = clock.current * p.spin;
      child.rotation.y = clock.current * p.spin * 0.7;
      child.scale.setScalar(phase < 0.08 ? phase / 0.08 : phase > 0.85 ? (1 - phase) / 0.15 : 1);
    });
  });

  return (
    <group ref={group}>
      {data.map((p, i) => (
        <mesh key={i}>
          <boxGeometry args={[p.size, p.size, p.size]} />
          <meshLambertMaterial color={p.color} />
        </mesh>
      ))}
    </group>
  );
}

/** Tiny star confetti twinkling around the launch path. */
function Sparkles({ active, towardHub }: { active: boolean; towardHub: [number, number] }) {
  const points = useRef<THREE.Points>(null);
  const { positions } = useMemo(() => {
    const rand = createSeededRandom(0x5a4d);
    const count = 40;
    const pos = new Float32Array(count * 3);
    const px = -towardHub[1];
    const pz = towardHub[0];
    for (let i = 0; i < count; i += 1) {
      const dist = 0.8 + rand() * 3.6;
      const spread = (rand() - 0.5) * 1.5;
      pos[i * 3] = towardHub[0] * dist + px * spread;
      pos[i * 3 + 1] = 0.95 + rand() * 1.3;
      pos[i * 3 + 2] = towardHub[1] * dist + pz * spread;
    }
    return { positions: pos };
  }, [towardHub]);

  useFrame((state) => {
    if (!points.current) return;
    points.current.visible = active;
    if (!active) return;
    const t = state.clock.elapsedTime;
    const attr = points.current.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < attr.count; i += 1) {
      attr.setY(i, 0.95 + ((attr.getY(i) - 0.95 + t * 0.35) % 1.3));
    }
    attr.needsUpdate = true;
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#ffd93d" size={0.07} sizeAttenuation transparent opacity={0.95} />
    </points>
  );
}

/* -------------------------------------------------------------------------- */
/*  Bundle                                                                    */
/* -------------------------------------------------------------------------- */

export interface RobotEffectsProps {
  status: AgentStatus;
  /** Unit direction (root-local) from the robot toward the central hub. */
  towardHub: [number, number];
  /** Live throughput; scales parcel volume and speed while streaming. */
  tokensPerSecond: number;
}

/**
 * Every per-status prop, in the robot's root space.
 * Rendered by both the procedural robot and the `.glb` model robot.
 */
export function RobotEffects({ status, towardHub, tokensPerSecond }: RobotEffectsProps) {
  return (
    <>
      <ThoughtBulb visible={status === 'THINKING'} />
      <ParcelStream
        active={status === 'STREAMING'}
        colors={PARCEL_COLORS}
        towardHub={towardHub}
        tokensPerSecond={tokensPerSecond}
      />
      <Sparkles active={status === 'STREAMING'} towardHub={towardHub} />

      {/* smoke rises off the monitor, which sits on the desk in front */}
      <group position={[-0.52, 1.0, 0.52]}>
        <SmokePuffs visible={status === 'ERROR'} />
      </group>
    </>
  );
}
