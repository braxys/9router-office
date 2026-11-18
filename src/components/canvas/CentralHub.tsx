'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, RoundedBox, Text } from '@react-three/drei';
import * as THREE from 'three';
import { createSeededRandom } from '@/lib/random';
import type { AgentStatus } from '@/lib/types';

export interface CentralHubProps {
  /** How many agents are currently busy (drives indicator lamps + bounce). */
  activeAgents: number;
  totalAgents: number;
  /** Per-agent statuses, used to light the little indicator stack. */
  statuses: AgentStatus[];
  colors: string[];
}

const LAMP_COLORS = ['#ff6b7a', '#ffc94d', '#58d6a9', '#5cb8f2'];

/**
 * The 9ROUTER CORE, reimagined as a friendly central server desk /
 * pneumatic-tube hub: chunky white cabinet, pastel indicator lamps,
 * spinning antenna topper and a conveyor of colourful parcels.
 */
export function CentralHub({ activeAgents, totalAgents, statuses, colors }: CentralHubProps) {
  const antennaBall = useRef<THREE.Mesh>(null);
  const antenna = useRef<THREE.Group>(null);
  const rotor = useRef<THREE.Group>(null);
  const beacon = useRef<THREE.Mesh>(null);
  const parcels = useRef<THREE.Group>(null);

  const busy = activeAgents > 0;

  /* Parcels orbiting the hub — purely decorative, deterministic layout. */
  const parcelData = useMemo(() => {
    const rand = createSeededRandom(0x9a4c);
    return Array.from({ length: 7 }, (_, i) => ({
      angle: (i / 7) * Math.PI * 2,
      radius: 1.55 + rand() * 0.35,
      y: 0.85 + rand() * 0.75,
      speed: 0.22 + rand() * 0.25,
      size: 0.15 + rand() * 0.07,
      color: LAMP_COLORS[i % LAMP_COLORS.length],
      spin: 0.6 + rand() * 1.2,
    }));
  }, []);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const dt = Math.min(delta, 0.05);

    // Antenna wobbles like a springy toy.
    if (antenna.current) {
      antenna.current.rotation.z = Math.sin(t * 1.7) * 0.11;
      antenna.current.rotation.x = Math.cos(t * 1.3) * 0.07;
    }
    if (antennaBall.current) {
      const s = 1 + Math.sin(t * (busy ? 6 : 2.2)) * (busy ? 0.12 : 0.05);
      antennaBall.current.scale.setScalar(s);
    }

    // Conveyor rotor.
    if (rotor.current) rotor.current.rotation.y += dt * (busy ? 0.85 : 0.3);

    // Beacon pulses only while work is flowing.
    if (beacon.current) {
      const mat = beacon.current.material as THREE.MeshBasicMaterial;
      mat.opacity = busy ? 0.55 + Math.abs(Math.sin(t * 4)) * 0.45 : 0.35;
      beacon.current.scale.setScalar(busy ? 1 + Math.sin(t * 4) * 0.07 : 1);
    }

    if (parcels.current) {
      parcels.current.children.forEach((child, i) => {
        const p = parcelData[i];
        if (!p) return;
        const a = p.angle + t * p.speed;
        child.position.set(
          Math.cos(a) * p.radius,
          p.y + Math.sin(t * 1.6 + i) * 0.06,
          Math.sin(a) * p.radius,
        );
        child.rotation.y += dt * p.spin;
        child.rotation.x += dt * p.spin * 0.5;
      });
    }
  });

  return (
    <group>
      {/* ---------------- desk cabinet ---------------- */}
      <RoundedBox args={[2.5, 1.0, 1.5]} radius={0.09} smoothness={3} position={[0, 0.5, 0]}>
        <meshLambertMaterial color="#fffdf8" />
      </RoundedBox>

      {/* desk top */}
      <RoundedBox args={[2.7, 0.12, 1.7]} radius={0.05} smoothness={3} position={[0, 1.04, 0]}>
        <meshLambertMaterial color="#e2b37b" />
      </RoundedBox>

      {/* drawer face + handles */}
      {[-0.62, 0.62].map((x) => (
        <group key={x} position={[x, 0.5, 0.76]}>
          <mesh>
            <boxGeometry args={[1.05, 0.62, 0.04]} />
            <meshLambertMaterial color="#f6eede" />
          </mesh>
          <mesh position={[0, 0.14, 0.05]}>
            <boxGeometry args={[0.34, 0.06, 0.05]} />
            <meshLambertMaterial color="#c9d6e0" />
          </mesh>
        </group>
      ))}

      {/* ---------------- server stack with indicator lamps ---------------- */}
      <group position={[0, 1.55, -0.12]}>
        <RoundedBox args={[1.5, 0.92, 0.62]} radius={0.06} smoothness={3}>
          <meshLambertMaterial color="#e8eef4" />
        </RoundedBox>
        {/* drive bays */}
        {[-0.28, 0, 0.28].map((y, i) => (
          <group key={i} position={[0, y, 0.32]}>
            <mesh>
              <boxGeometry args={[1.26, 0.19, 0.03]} />
              <meshLambertMaterial color="#f7fbff" />
            </mesh>
            {/* status LEDs per agent */}
            {statuses.map((s, j) => {
              const color =
                s === 'ERROR'
                  ? '#ff6b7a'
                  : s === 'THINKING'
                    ? '#ffc94d'
                    : s === 'STREAMING'
                      ? '#58d6a9'
                      : '#5cb8f2';
              return (
                <mesh key={j} position={[-0.48 + j * 0.19, 0, 0.025]}>
                  <boxGeometry args={[0.09, 0.09, 0.02]} />
                  <meshBasicMaterial color={color} />
                </mesh>
              );
            })}
            <mesh position={[0.46, 0, 0.025]}>
              <boxGeometry args={[0.16, 0.05, 0.02]} />
              <meshBasicMaterial color={colors[i % colors.length] ?? '#c9d6e0'} />
            </mesh>
          </group>
        ))}
      </group>

      {/* ---------------- pneumatic tube hub on top ---------------- */}
      <group position={[0, 2.06, 0.02]}>
        {/* yellow funnel the parcels drop into */}
        <mesh>
          <cylinderGeometry args={[0.34, 0.24, 0.24, 20]} />
          <meshLambertMaterial color="#ffd166" />
        </mesh>
        {/* glass dome over the funnel */}
        <mesh position={[0, 0.2, 0]}>
          <sphereGeometry args={[0.22, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshLambertMaterial color="#9fdcf7" transparent opacity={0.55} />
        </mesh>
        <mesh ref={beacon} position={[0, 0.2, 0]}>
          <sphereGeometry args={[0.1, 16, 16]} />
          <meshBasicMaterial color="#ff8fa3" transparent opacity={0.6} />
        </mesh>
      </group>

      {/* four tubes leaving the funnel and dropping to the desk corners */}
      {[
        [0, 1],
        [0, -1],
        [1, 0],
        [-1, 0],
      ].map(([dx, dz], i) => {
        const a = Math.atan2(dx, dz);
        return (
          <group key={i} position={[dx * 0.28, 2.1, dz * 0.28]} rotation={[0, a, 0]}>
            {/* short horizontal run out of the funnel */}
            <mesh position={[0, 0, 0.16]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.055, 0.055, 0.3, 10]} />
              <meshLambertMaterial color="#9fdcf7" />
            </mesh>
            {/* elbow down */}
            <mesh position={[0, -0.07, 0.3]} rotation={[0, 0, 0]}>
              <sphereGeometry args={[0.058, 10, 10]} />
              <meshLambertMaterial color="#7fcdf0" />
            </mesh>
            {/* vertical drop */}
            <mesh position={[0, -0.24, 0.3]}>
              <cylinderGeometry args={[0.055, 0.055, 0.32, 10]} />
              <meshLambertMaterial color="#9fdcf7" />
            </mesh>
          </group>
        );
      })}

      {/* ---------------- springy antenna on the back-right corner ---------------- */}
      <group ref={antenna} position={[0.62, 1.62, -0.42]}>
        <mesh position={[0, 0.3, 0]}>
          <cylinderGeometry args={[0.022, 0.03, 0.6, 8]} />
          <meshLambertMaterial color="#c9d6e0" />
        </mesh>
        <mesh ref={antennaBall} position={[0, 0.64, 0]}>
          <sphereGeometry args={[0.11, 18, 18]} />
          <meshLambertMaterial color="#ff8fa3" />
        </mesh>
        <mesh position={[0, 0.8, 0]}>
          <sphereGeometry args={[0.035, 10, 10]} />
          <meshBasicMaterial color="#ffc94d" />
        </mesh>
      </group>

      {/* rotating parcel carousel */}
      <group ref={parcels}>
        {parcelData.map((p, i) => (
          <mesh key={i} position={[0, p.y, 0]}>
            <boxGeometry args={[p.size, p.size, p.size]} />
            <meshLambertMaterial color={p.color} />
          </mesh>
        ))}
      </group>

      {/* label plate — sits above the robot name badges so the two never
          collide in the default overview framing */}
      <Billboard position={[0, 5.0, 0.2]}>
        <Text
          fontSize={0.34}
          color="#4a5a68"
          anchorX="center"
          anchorY="middle"
          letterSpacing={0.08}
          outlineWidth={0.03}
          outlineColor="#fffdf8"
        >
          9ROUTER CORE
        </Text>
        <Text
          position={[0, -0.36, 0]}
          fontSize={0.17}
          color="#8a99a6"
          anchorX="center"
          anchorY="middle"
          letterSpacing={0.1}
          outlineWidth={0.02}
          outlineColor="#fffdf8"
        >
          {`${activeAgents}/${totalAgents} ROBOTS WORKING`}
        </Text>
      </Billboard>
    </group>
  );
}
