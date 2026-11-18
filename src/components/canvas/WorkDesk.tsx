'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { createSeededRandom } from '@/lib/random';
import type { AgentStatus } from '@/lib/types';

export interface WorkDeskProps {
  accentColor: string;
  status: AgentStatus;
  /** Colour of the swivel chair the robot sits on. */
  chairColor: string;
}

const STATUS_SCREEN: Record<AgentStatus, string> = {
  IDLE: '#9fd8f7',
  THINKING: '#ffd93d',
  STREAMING: '#8fe6c4',
  ERROR: '#ff9aa6',
};

/**
 * Single source of truth for the desk <-> robot vertical alignment, in the
 * desk's local space. `Scene` positions the robot from these numbers so the
 * robot always lands on the chair instead of hovering above the floor.
 *
 *   desk surface ....... 0.80
 *   robot hands ........ root.y + 0.40  ->  0.80  (resting on the desk)
 *   robot hips ......... root.y + 0.22  ->  0.62
 *   chair seat top ..... 0.58           (thighs bridge the last 0.04)
 */
export const DESK_SEAT = {
  x: 0,
  y: 0.4,
  z: -0.78,
  /** Y of the desk top surface; everything standing on the desk uses this. */
  surfaceY: 0.8,
} as const;

/**
 * A chunky office desk: warm wood top, white drawer unit, retro monitor,
 * rainbow swivel chair, coffee mug and a stack of papers.
 */
export function WorkDesk({ accentColor, status, chairColor }: WorkDeskProps) {
  const screen = useRef<THREE.Mesh>(null);
  const chair = useRef<THREE.Group>(null);
  const coffeeSteam = useRef<THREE.Group>(null);
  const keys = useRef<THREE.InstancedMesh>(null);
  const TOP = DESK_SEAT.surfaceY;

  // Lay out the 14 keycaps once inside a single InstancedMesh.
  useLayoutEffect(() => {
    const mesh = keys.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 14; i += 1) {
      const col = i % 7;
      const row = Math.floor(i / 7);
      dummy.position.set(-0.24 + col * 0.08, 0.026, -0.048 + row * 0.08);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  const papers = useMemo(() => {
    const rand = createSeededRandom(0x9a11);
    return Array.from({ length: 3 }, (_, i) => ({
      y: i * 0.032,
      rot: (rand() - 0.5) * 0.3,
      w: 0.32 - i * 0.02,
      d: 0.24 - i * 0.015,
    }));
  }, []);

  const isError = status === 'ERROR';
  const isThinking = status === 'THINKING';

  const targetColor = useRef(new THREE.Color());

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const dt = Math.min(delta, 0.05);

    // Screen flicker / colour pulse.
    if (screen.current) {
      const mat = screen.current.material as THREE.MeshBasicMaterial;
      const base = isError ? 0.55 + Math.abs(Math.sin(t * 16)) * 0.45 : 1;
      mat.opacity = base;
      targetColor.current.set(STATUS_SCREEN[status]);
      mat.color.lerp(targetColor.current, Math.min(1, dt * 5));
    }

    // Chair swivels while idle, bounces when thinking, rocks when erroring.
    if (chair.current) {
      if (isError) {
        chair.current.rotation.y = Math.sin(t * 14) * 0.06;
        chair.current.position.y = 0;
      } else if (isThinking) {
        chair.current.rotation.y = Math.sin(t * 1.1) * 0.05;
        chair.current.position.y = Math.abs(Math.sin(t * 3.4)) * 0.02;
      } else {
        chair.current.rotation.y = Math.sin(t * 0.62) * 0.22;
        chair.current.position.y = 0;
      }
    }

    // Coffee steam drifts up.
    if (coffeeSteam.current) {
      coffeeSteam.current.visible = !isThinking;
      coffeeSteam.current.children.forEach((child, i) => {
        const phase = (t * 0.5 + i * 0.33) % 1;
        child.position.y = 0.1 + phase * 0.34;
        child.position.x = Math.sin(phase * 3 + i) * 0.035;
        child.scale.setScalar(0.5 + phase * 0.7);
        const mesh = child as THREE.Mesh;
        (mesh.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - phase);
      });
    }
  });

  return (
    <group>
      {/* ---------------- desk top ---------------- */}
      <RoundedBox
        args={[1.8, 0.1, 1.0]}
        radius={0.03}
        smoothness={2}
        position={[0, TOP - 0.05, 0]}
       
       
      >
        <meshLambertMaterial color="#e2b37b" />
      </RoundedBox>

      {/* drawer pedestal (left end) */}
      <RoundedBox
        args={[0.52, TOP - 0.1, 0.86]}
        radius={0.03}
        smoothness={2}
        position={[-0.6, (TOP - 0.1) / 2, 0]}
       
       
      >
        <meshLambertMaterial color="#fffdf8" />
      </RoundedBox>
      {[0.24, 0.52].map((y) => (
        <group key={y} position={[-0.6, y, 0.44]}>
          <mesh>
            <boxGeometry args={[0.42, 0.17, 0.02]} />
            <meshLambertMaterial color="#f3ece0" />
          </mesh>
          <mesh position={[0, 0, 0.02]}>
            <boxGeometry args={[0.16, 0.03, 0.02]} />
            <meshLambertMaterial color="#c9d6e0" />
          </mesh>
        </group>
      ))}

      {/* two legs under the right end */}
      {[-0.34, 0.34].map((z) => (
        <mesh key={z} position={[0.76, (TOP - 0.1) / 2, z]}>
          <boxGeometry args={[0.09, TOP - 0.1, 0.09]} />
          <meshLambertMaterial color="#c98a4b" />
        </mesh>
      ))}

      {/* ---------------- retro monitor (left of the robot, angled inward) ---------------- */}
      <group position={[-0.52, TOP, -0.26]} rotation={[0, 0.5, 0]}>
        {/* stand */}
        <mesh position={[0, 0.02, 0]}>
          <boxGeometry args={[0.28, 0.04, 0.2]} />
          <meshLambertMaterial color="#e8eef4" />
        </mesh>
        <mesh position={[0, 0.1, 0]}>
          <boxGeometry args={[0.08, 0.13, 0.08]} />
          <meshLambertMaterial color="#dbe4ec" />
        </mesh>
        {/* chassis */}
        <RoundedBox
          args={[0.66, 0.46, 0.17]}
          radius={0.04}
          smoothness={2}
          position={[0, 0.36, 0]}
         
        >
          <meshLambertMaterial color="#f4f7fa" />
        </RoundedBox>
        {/* bezel */}
        <mesh position={[0, 0.37, 0.09]}>
          <boxGeometry args={[0.56, 0.36, 0.02]} />
          <meshLambertMaterial color="#dfe7ee" />
        </mesh>
        {/* glowing screen */}
        <mesh ref={screen} position={[0, 0.37, 0.104]}>
          <planeGeometry args={[0.47, 0.28]} />
          <meshBasicMaterial color={STATUS_SCREEN[status]} transparent opacity={1} />
        </mesh>
        {/* little content bars on the screen */}
        {[0.09, 0.02, -0.05].map((dy, i) => (
          <mesh key={i} position={[0.06, 0.37 + dy, 0.107]}>
            <planeGeometry args={[0.28 - i * 0.06, 0.026]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.55} />
          </mesh>
        ))}
        {/* power LED */}
        <mesh position={[0.26, 0.18, 0.095]}>
          <boxGeometry args={[0.03, 0.03, 0.02]} />
          <meshBasicMaterial color={accentColor} />
        </mesh>
      </group>

      {/* ---------------- keyboard on the desk, right in front of the robot ---------------- */}
      <group position={[0.14, TOP, -0.42]}>
        <RoundedBox args={[0.62, 0.04, 0.22]} radius={0.02} smoothness={2}>
          <meshLambertMaterial color="#f4f7fa" />
        </RoundedBox>
        {/* 14 keycaps batched into one InstancedMesh */}
        <instancedMesh ref={keys} args={[undefined, undefined, 14]}>
          <boxGeometry args={[0.064, 0.012, 0.06]} />
          <meshLambertMaterial color="#e2e9ef" />
        </instancedMesh>
      </group>

      {/* ---------------- coffee mug ---------------- */}
      <group position={[0.68, TOP, -0.16]}>
        <mesh>
          <cylinderGeometry args={[0.08, 0.07, 0.16, 14]} />
          <meshLambertMaterial color={accentColor} />
        </mesh>
        <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.066, 14]} />
          <meshLambertMaterial color="#6b4a2f" />
        </mesh>
        <mesh position={[0.09, 0.01, 0]} rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[0.048, 0.015, 8, 14]} />
          <meshLambertMaterial color={accentColor} />
        </mesh>
        <group ref={coffeeSteam} position={[0, 0.09, 0]}>
          {[0, 1, 2].map((i) => (
            <mesh key={i}>
              <boxGeometry args={[0.03, 0.03, 0.03]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={0.4} depthWrite={false} />
            </mesh>
          ))}
        </group>
      </group>

      {/* ---------------- paper stack ---------------- */}
      <group position={[0.66, TOP, 0.26]}>
        {papers.map((p, i) => (
          <mesh key={i} position={[0, p.y, 0]} rotation={[0, p.rot, 0]}>
            <boxGeometry args={[p.w, 0.028, p.d]} />
            <meshLambertMaterial color={i % 2 === 0 ? '#ffffff' : '#fdf3e3'} />
          </mesh>
        ))}
      </group>

      {/* ---------------- swivel chair — behind the desk, where the robot sits ---------------- */}
      <group ref={chair} position={[DESK_SEAT.x, 0, DESK_SEAT.z]}>
        {/* seat (top surface at 0.58) */}
        <RoundedBox
          args={[0.62, 0.1, 0.58]}
          radius={0.04}
          smoothness={2}
          position={[0, 0.53, 0]}
         
        >
          <meshLambertMaterial color={chairColor} />
        </RoundedBox>
        {/* backrest, behind the robot */}
        <RoundedBox
          args={[0.62, 0.56, 0.11]}
          radius={0.04}
          smoothness={2}
          position={[0, 0.82, -0.27]}
          rotation={[0.1, 0, 0]}
         
        >
          <meshLambertMaterial color={chairColor} />
        </RoundedBox>
        {/* gas cylinder */}
        <mesh position={[0, 0.26, 0]}>
          <cylinderGeometry args={[0.055, 0.055, 0.46, 10]} />
          <meshLambertMaterial color="#c9d6e0" />
        </mesh>
        {/* star base */}
        {Array.from({ length: 5 }, (_, i) => {
          const a = (i / 5) * Math.PI * 2;
          return (
            <mesh
              key={i}
              position={[Math.cos(a) * 0.2, 0.05, Math.sin(a) * 0.2]}
              rotation={[0, -a, 0]}
             
            >
              <boxGeometry args={[0.42, 0.05, 0.07]} />
              <meshLambertMaterial color="#b7c4cf" />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}
