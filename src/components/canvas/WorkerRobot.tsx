'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { AgentStatus } from '@/lib/types';
import {
  ANTENNA_BALL,
  FACE,
  HANDS,
  ROBOT_COLORS,
  robotNodePosition,
} from '@/lib/robotModel';
import { RobotParts } from './RobotParts';
import { RobotEffects } from './RobotEffects';
import { DESK_SEAT } from './WorkDesk';

export interface WorkerRobotProps {
  accentColor: string;
  status: AgentStatus;
  /** Unit direction (local space) from the robot toward the central hub. */
  towardHub: [number, number];
  /** Live throughput; scales parcel volume and speed while streaming. */
  tokensPerSecond: number;
}

/** Springy ease that overshoots slightly — gives everything a toy feel. */
function spring(current: number, target: number, dt: number, stiffness = 9) {
  return current + (target - current) * Math.min(1, dt * stiffness);
}

/* -------------------------------------------------------------------------- */
/*  Sub-parts                                                                 */
/* -------------------------------------------------------------------------- */

/** Chunky monitor-style head with big expressive square eyes. */
function RobotHead({
  accent,
  status,
  headRef,
  antennaRef,
  antennaBallRef,
  eyeLRef,
  eyeRRef,
  eyeSpinRef,
  mouthRef,
}: {
  accent: string;
  status: AgentStatus;
  headRef: React.RefObject<THREE.Group | null>;
  antennaRef: React.RefObject<THREE.Group | null>;
  antennaBallRef: React.RefObject<THREE.Mesh | null>;
  eyeLRef: React.RefObject<THREE.Group | null>;
  eyeRRef: React.RefObject<THREE.Group | null>;
  eyeSpinRef: React.RefObject<THREE.Group | null>;
  mouthRef: React.RefObject<THREE.Mesh | null>;
}) {
  const isError = status === 'ERROR';
  const palette = {
    ink: ROBOT_COLORS.ink,
    blush: ROBOT_COLORS.blush,
    pink: ROBOT_COLORS.pink,
    white: ROBOT_COLORS.white,
  };
  const [headX, headY, headZ] = robotNodePosition('head');
  const [antennaX, antennaY, antennaZ] = robotNodePosition('antenna');

  return (
    <group ref={headRef} position={[headX, headY, headZ]}>
      {/* cranium, face plate and ear bolts come from the part spec */}
      <RobotParts node="head" accent={accent} />

      {/* eyes — driven at runtime (blink / squint / spin), so they keep refs */}
      <group ref={eyeSpinRef} position={FACE.eyeGroup.position}>
        {isError ? (
          <>
            {/* X X eyes */}
            <group ref={eyeLRef} position={[-FACE.eyeOffsetX, 0, 0]}>
              <mesh rotation={[0, 0, FACE.errorBar.angle]}>
                <boxGeometry args={[...FACE.errorBar.size]} />
                <meshBasicMaterial color={palette.pink} />
              </mesh>
              <mesh rotation={[0, 0, -FACE.errorBar.angle]}>
                <boxGeometry args={[...FACE.errorBar.size]} />
                <meshBasicMaterial color={palette.pink} />
              </mesh>
            </group>
            <group ref={eyeRRef} position={[FACE.eyeOffsetX, 0, 0]}>
              <mesh rotation={[0, 0, FACE.errorBar.angle]}>
                <boxGeometry args={[...FACE.errorBar.size]} />
                <meshBasicMaterial color={palette.pink} />
              </mesh>
              <mesh rotation={[0, 0, -FACE.errorBar.angle]}>
                <boxGeometry args={[...FACE.errorBar.size]} />
                <meshBasicMaterial color={palette.pink} />
              </mesh>
            </group>
          </>
        ) : (
          <>
            <group ref={eyeLRef} position={[-FACE.eyeOffsetX, 0, 0]}>
              <mesh>
                <boxGeometry args={[...FACE.pupil.size]} />
                <meshBasicMaterial color={palette.ink} />
              </mesh>
              {/* glint */}
              <mesh position={FACE.glint.position}>
                <boxGeometry args={[...FACE.glint.size]} />
                <meshBasicMaterial color={palette.white} />
              </mesh>
            </group>
            <group ref={eyeRRef} position={[FACE.eyeOffsetX, 0, 0]}>
              <mesh>
                <boxGeometry args={[...FACE.pupil.size]} />
                <meshBasicMaterial color={palette.ink} />
              </mesh>
              <mesh position={FACE.glint.position}>
                <boxGeometry args={[...FACE.glint.size]} />
                <meshBasicMaterial color={palette.white} />
              </mesh>
            </group>
          </>
        )}
      </group>

      {/* LED mouth */}
      <mesh ref={mouthRef} position={FACE.mouth.position}>
        <boxGeometry args={[...FACE.mouth.size]} />
        <meshBasicMaterial color={palette.ink} />
      </mesh>

      {/* cheek blush */}
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[
            side * FACE.blush.position[0],
            FACE.blush.position[1],
            FACE.blush.position[2],
          ]}
        >
          <boxGeometry args={[...FACE.blush.size]} />
          <meshBasicMaterial color={palette.blush} />
        </mesh>
      ))}

      {/* antenna — stalk from the spec, ball driven at runtime */}
      <group ref={antennaRef} position={[antennaX - headX, antennaY - headY, antennaZ - headZ]}>
        <RobotParts node="antenna" accent={accent} />
        <mesh ref={antennaBallRef} position={ANTENNA_BALL.position}>
          <sphereGeometry
            args={[ANTENNA_BALL.radius, ANTENNA_BALL.segments, ANTENNA_BALL.segments]}
          />
          <meshLambertMaterial color={ROBOT_COLORS.yellow} />
        </mesh>
      </group>
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main robot                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The procedural robot.
 *
 * Its rigid geometry is rendered from `src/lib/robotModel.ts` (via
 * `<RobotParts/>`), so the on-screen robot and the generated
 * `public/models/worker-robot.glb` are built from the same numbers. The
 * animation channels below are hand-written and stay that way: they are the
 * performance, not the shape.
 */
export function WorkerRobot({
  accentColor,
  status,
  towardHub,
  tokensPerSecond,
}: WorkerRobotProps) {
  const root = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const antenna = useRef<THREE.Group>(null);
  const antennaBall = useRef<THREE.Mesh>(null);
  const eyeL = useRef<THREE.Group>(null);
  const eyeR = useRef<THREE.Group>(null);
  const eyeSpin = useRef<THREE.Group>(null);
  const mouth = useRef<THREE.Mesh>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const handL = useRef<THREE.Mesh>(null);
  const handR = useRef<THREE.Mesh>(null);

  const isError = status === 'ERROR';
  const isThinking = status === 'THINKING';
  const isStreaming = status === 'STREAMING';

  // Joint pivots come from the spec, so a shape tweak moves the rig with it.
  const [, headRestY] = robotNodePosition('head');
  const [armLX, armLY, armLZ] = robotNodePosition('armL');
  const [armRX, armRY, armRZ] = robotNodePosition('armR');

  // Smoothed animation channels (never React state).
  const anim = useRef({
    lean: 0,
    hop: 0,
    tilt: 0,
    armLiftR: 0,
    armLiftL: 0,
    time: 0,
  });

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const t = (anim.current.time += dt);
    const a = anim.current;

    a.lean = spring(a.lean, isThinking ? 1 : isStreaming ? 0.35 : 0, dt, 7);
    a.tilt = spring(a.tilt, isError ? 1 : 0, dt, 6);
    a.armLiftR = spring(a.armLiftR, isStreaming ? 0.55 : 0, dt, 7);
    a.armLiftL = spring(a.armLiftL, isError ? 1 : 0, dt, 7);

    // ---- Root: seated sway + startle hop --------------------------------
    if (root.current) {
      const sway = Math.sin(t * 0.9) * 0.045 * (1 - a.lean) * (1 - a.tilt);
      root.current.rotation.z = sway + a.tilt * 0.06;
      // ERROR: little repeated jumps on the chair
      const hopPhase = (t % 1.5) / 1.5;
      const hopY = isError ? Math.abs(Math.sin(hopPhase * Math.PI)) * 0.16 : 0;
      const breathe = Math.sin(t * 2.1) * 0.012 * (1 - a.lean);
      // Seated on the chair seat — DESK_SEAT in WorkDesk owns this number.
      root.current.position.y = DESK_SEAT.y + hopY + breathe;
      root.current.rotation.y = a.armLiftR * -0.28;
    }

    // ---- Torso lean ------------------------------------------------------
    if (torso.current) {
      torso.current.rotation.x = a.lean * 0.3;
      torso.current.position.z = a.lean * 0.07;
      torso.current.scale.y = 1 - a.tilt * 0.04;
    }

    // ---- Head ------------------------------------------------------------
    if (head.current) {
      // IDLE looks around then glances at the coffee cup; THINKING looks down.
      const idleLook = Math.sin(t * 0.5) * 0.3 + Math.sin(t * 0.21) * 0.14;
      const coffeeGlance = Math.sin(t * 0.33) > 0.86 ? 0.42 : 0;
      const look = isThinking ? Math.sin(t * 2.2) * 0.09 : idleLook + coffeeGlance * 0.4;
      head.current.rotation.y = look * (1 - a.tilt);
      head.current.rotation.z = isError ? Math.PI / 4 : a.tilt * 0.12;
      head.current.rotation.x = a.lean * 0.16 + (isThinking ? 0.1 : 0);
      // IDLE nodding
      head.current.position.y =
        headRestY + (isError ? 0 : Math.sin(t * 2.1) * 0.014) + a.lean * 0.02;
    }

    // ---- Antenna wobble (springy, lags behind the head) ------------------
    if (antenna.current) {
      const wobble = isError ? 0.5 : isThinking ? 0.2 : 0.09;
      antenna.current.rotation.z = Math.sin(t * (isError ? 9 : 2.3)) * wobble;
      antenna.current.rotation.x = Math.cos(t * (isError ? 7 : 1.7)) * wobble * 0.7;
    }
    if (antennaBall.current) {
      const s = 1 + Math.sin(t * (isError ? 12 : 2.6)) * (isError ? 0.18 : 0.07);
      antennaBall.current.scale.setScalar(s);
    }

    // ---- Eyes ------------------------------------------------------------
    if (eyeL.current && eyeR.current) {
      if (isError) {
        // spinning dizzy eyes
        eyeSpin.current?.rotation.set(0, 0, 0);
        eyeL.current.rotation.z = Math.sin(t * 6) * 0.3;
        eyeR.current.rotation.z = -Math.sin(t * 6) * 0.3;
      } else {
        // blink
        const blinkCycle = t % 4.2;
        const blink = blinkCycle > 4.0 ? Math.max(0.1, Math.abs(blinkCycle - 4.1) / 0.1) : 1;
        const squint = isThinking ? 0.72 : isStreaming ? 0.85 : 1;
        eyeL.current.scale.y = blink * squint;
        eyeR.current.scale.y = blink * squint;
        eyeL.current.rotation.z = 0;
        eyeR.current.rotation.z = 0;
      }
    }

    // ---- Mouth -----------------------------------------------------------
    if (mouth.current) {
      const w = isError ? 0.14 : isThinking ? 0.1 : isStreaming ? 0.18 : 0.2;
      const h = isError ? 0.11 : isThinking ? 0.035 : 0.045;
      mouth.current.scale.set(w / 0.2, h / 0.045, 1);
    }

    // ---- Arms ------------------------------------------------------------
    // Typing hands hover over the keyboard and jitter.
    const typeSpeed = isThinking ? 26 : isStreaming ? 14 : 2.4;
    const typeAmp = isThinking ? 0.05 : isStreaming ? 0.03 : 0.006;
    const lPhase = t * typeSpeed;
    const rPhase = t * typeSpeed + 1.9;

    if (armL.current) {
      const lift = a.armLiftL;
      armL.current.rotation.x = -0.35 - lift * 1.5 + Math.sin(lPhase) * typeAmp * 2;
      armL.current.rotation.z = 0.12 + lift * 0.85;
    }
    if (armR.current) {
      const lift = a.armLiftR;
      armR.current.rotation.x = -0.35 - lift * 1.45 + Math.sin(rPhase) * typeAmp * 2;
      armR.current.rotation.z = -0.12 - lift * 0.6;
    }
    if (handL.current) {
      handL.current.position.y = Math.sin(lPhase) * typeAmp;
    }
    if (handR.current) {
      handR.current.position.y = Math.sin(rPhase) * typeAmp;
    }
  });

  return (
    <group ref={root} position={[DESK_SEAT.x, DESK_SEAT.y, DESK_SEAT.z]}>
      {/* ------------------------------ SEATED LEGS -----------------------
          The robot sits on the chair; thighs run forward under the desk and
          shins drop to the floor. Without these the robot reads as floating.
          Geometry comes from the shared part spec. */}
      <RobotParts node="root" accent={accentColor} />

      {/* ------------------------------ TORSO ------------------------------ */}
      <group ref={torso}>
        <RobotParts node="torso" accent={accentColor} />

        {/* ---- HEAD ---- */}
        <RobotHead
          accent={accentColor}
          status={status}
          headRef={head}
          antennaRef={antenna}
          antennaBallRef={antennaBall}
          eyeLRef={eyeL}
          eyeRRef={eyeR}
          eyeSpinRef={eyeSpin}
          mouthRef={mouth}
        />
      </group>

      {/* ------------------------------ ARMS ------------------------------ */}
      <group ref={armL} position={[armLX, armLY, armLZ]}>
        <RobotParts node="armL" accent={accentColor} />
        <mesh ref={handL} position={HANDS.position}>
          <boxGeometry args={[...HANDS.size]} />
          <meshLambertMaterial color={ROBOT_COLORS.cream} />
        </mesh>
      </group>

      <group ref={armR} position={[armRX, armRY, armRZ]}>
        <RobotParts node="armR" accent={accentColor} />
        <mesh ref={handR} position={HANDS.position}>
          <boxGeometry args={[...HANDS.size]} />
          <meshLambertMaterial color={ROBOT_COLORS.cream} />
        </mesh>
      </group>

      {/* ------------------------------ STATE PROPS ----------------------- */}
      <RobotEffects
        status={status}
        towardHub={towardHub}
        tokensPerSecond={tokensPerSecond}
      />
    </group>
  );
}
