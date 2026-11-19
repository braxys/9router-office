'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal, useFrame } from '@react-three/fiber';
import { GLTFLoader } from 'three-stdlib';
import * as THREE from 'three';
import { SkeletonUtils } from 'three-stdlib';
import type { AgentStatus } from '@/lib/types';
import type { ResolvedIdentity } from '@/lib/providerIdentity';
import { ROBOT_HEIGHT, darkenHex } from '@/lib/robotModel';
import { useUiStore } from '@/store/useUiStore';
import { AntennaTopper, RobotIdentityParts } from './RobotParts';
import { RobotEffects } from './RobotEffects';
import { DESK_SEAT } from './WorkDesk';

/** Same springy ease as the procedural rig, so both bodies move alike. */
function spring(current: number, target: number, dt: number, stiffness = 9) {
  return current + (target - current) * Math.min(1, dt * stiffness);
}

/* -------------------------------------------------------------------------- */
/*  Loading                                                                   */
/* -------------------------------------------------------------------------- */

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; scene: THREE.Group }
  | { status: 'failed'; message: string };

/**
 * One in-flight promise per URL, shared by all four desks.
 *
 * `useGLTF` from drei is deliberately NOT used here. It suspends by *throwing*
 * the loader promise and then throws the rejection during render, which means a
 * missing file surfaces as an uncaught render error. An error boundary can catch
 * it, but React 19 still reports every caught render error to `window` — so the
 * smoke gate's "zero page errors" rule could never pass on the fallback path.
 *
 * Loading imperatively keeps render pure: a bad URL becomes state, the boundary
 * is unnecessary, and the procedural robot renders instead.
 */
const pending = new Map<string, Promise<THREE.Group>>();

function loadModelScene(url: string): Promise<THREE.Group> {
  const cached = pending.get(url);
  if (cached) return cached;

  const promise = new Promise<THREE.Group>((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load(
      url,
      (gltf) => resolve(gltf.scene),
      undefined,
      (error) => reject(error instanceof Error ? error : new Error(String(error))),
    );
  });

  // A rejection is kept in the map on purpose: the next desk asking for the same
  // broken URL must fail fast instead of firing another request, and a failed
  // load is not retried until the page reloads.
  pending.set(url, promise);
  return promise;
}

/* -------------------------------------------------------------------------- */
/*  The model robot                                                           */
/* -------------------------------------------------------------------------- */

export interface ModelRobotProps {
  /** Path to the `.glb` (under `/public` or an absolute http(s) URL). */
  url: string;
  /** The agent's accent colour; tints the `body` and `limb` parts. */
  accentColor: string;
  /** Which provider bot this is: its shell, topper and emblem. */
  identity: ResolvedIdentity;
  /** Current status, for the shared per-status props. */
  status: AgentStatus;
  /** Unit direction (root-local) toward the central hub. */
  towardHub: [number, number];
  /** Live throughput; scales the parcel stream. */
  tokensPerSecond: number;
  /** Rendered if the model cannot be loaded. */
  fallback: React.ReactNode;
}

/**
 * The opt-in `.glb` body.
 *
 * Loaded through `next/dynamic` from `Scene`, so `GLTFLoader` never enters the
 * initial bundle for someone who keeps the procedural robot.
 *
 * Two things this component must get right, or the model looks broken:
 *  1. **Seating.** The generated model's origin is the chair seat (root-local,
 *     feet at y = −0.4), the same space `DESK_SEAT` positions. A hand-made model
 *     is normalised to `ROBOT_HEIGHT` so it lands on the chair at any scale.
 *  2. **Per-agent colour.** `SkeletonUtils.clone` shares *materials* between
 *     clones, so they are cloned per instance before tinting — otherwise all
 *     four desks would end up the same colour.
 */
export function ModelRobot({ url, fallback, ...rest }: ModelRobotProps) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    loadModelScene(url).then(
      (scene) => {
        if (cancelled) return;
        setState({ status: 'ready', scene });
        // A success after an earlier failure clears the HUD warning.
        useUiStore.getState().setModelError(null);
      },
      (error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof Error
            ? error.message
            : typeof error === 'string'
              ? error
              : 'unknown error';
        setState({ status: 'failed', message });

        // `console.warn`, never `error`: a missing model file is a user-facing
        // condition, not a defect, and the smoke test treats console errors as
        // bugs. Every desk shares one request, so each of them reports the same
        // failure; only the first one logs and only the first one reaches the
        // store, which is what keeps this to a single line.
        if (useUiStore.getState().modelError === null) {
          console.warn(`[9router-office] Could not load model ${url}: ${message}`);
          useUiStore.getState().setModelError(message);
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, [url]);

  if (state.status !== 'ready') return <>{fallback}</>;

  return <LoadedModelRobot scene={state.scene} {...rest} />;
}

function LoadedModelRobot({
  scene,
  accentColor,
  identity,
  status,
  towardHub,
  tokensPerSecond,
}: Omit<ModelRobotProps, 'fallback' | 'url'> & { scene: THREE.Group }) {
  const instance = useMemo(() => {
    const copy = SkeletonUtils.clone(scene) as THREE.Object3D;

    // Normalise: a hand-made model of any height sits like the procedural robot.
    // `bounds` is measured in the model's own space, before any transform we add.
    copy.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(copy);
    const size = new THREE.Vector3();
    bounds.getSize(size);
    const scale = size.y > 0.0001 ? ROBOT_HEIGHT / size.y : 1;
    copy.scale.setScalar(scale);

    // Put the model's feet on the floor. This group already sits at
    // DESK_SEAT.y, so the floor is at root-local y = -DESK_SEAT.y; the clone is
    // lifted by however far below its own origin its feet are.
    //
    // The generated `.glb` needs no correction (feet already at -0.4, origin on
    // the seat → offset 0), and a hand-made model standing on y = 0 is lowered
    // by exactly the seat height. Either way the feet land on the floor.
    copy.position.set(0, -DESK_SEAT.y - bounds.min.y * scale, 0);

    const body = accentColor;
    const limb = darkenHex(accentColor, 0.82);

    copy.traverse((object: THREE.Object3D) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      // Per-instance material so tinting one desk cannot tint the other three.
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((material) => material.clone())
        : mesh.material.clone();

      const role = object.userData?.recolor;
      const apply = (material: THREE.Material) => {
        const colored = material as THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
        if (!colored.color) return;
        if (role === 'body') colored.color.set(body);
        else if (role === 'limb') colored.color.set(limb);

        // Match the procedural robot's flat look: no PBR highlights.
        if ((material as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
          const standard = material as THREE.MeshStandardMaterial;
          standard.metalness = 0;
          standard.roughness = 1;
        }
      };

      if (Array.isArray(mesh.material)) mesh.material.forEach(apply);
      else apply(mesh.material as THREE.Material);
    });

    // The neutral `.glb` bakes the yellow antenna ball. Any provider topper
    // replaces it, so hide the baked one rather than stacking a shell on a ball.
    if (identity.topper !== 'ball') {
      const ball = copy.getObjectByName('antennaBall');
      if (ball) ball.visible = false;
    }

    return copy;
  }, [scene, accentColor, identity]);

  // The joints are looked up once per clone. The `.glb` stores them under the
  // same names the spec uses (`ROBOT_NODES`), which is what lets the animation
  // below be the same performance for either body.
  //
  // A memo rather than a ref: the identity portals below need a container object
  // *during render*, and these objects are stable for as long as `instance` is.
  // `useFrame` reads them directly and mutates their properties — that is the
  // animation, not React state.
  const joints = useMemo(
    () => ({
      torso: instance.getObjectByName('torso') ?? null,
      head: instance.getObjectByName('head') ?? null,
      antenna: instance.getObjectByName('antenna') ?? null,
      armL: instance.getObjectByName('armL') ?? null,
      armR: instance.getObjectByName('armR') ?? null,
    }),
    [instance],
  );

  // Rest poses, so every frame rotates around the spec's pivot instead of
  // accumulating offsets.
  const rest = useMemo(
    () => ({
      headY: joints.head?.position.y ?? 0,
      antennaZ: joints.antenna?.rotation.z ?? 0,
    }),
    [joints],
  );

  // The animation channel. `joints` is a render value (the portals need it
  // during render), and React forbids mutating those after render — so the
  // frame loop goes through a ref that always points at the current joints.
  const animated = useRef(joints);
  useEffect(() => {
    animated.current = joints;
  }, [joints]);

  const isError = status === 'ERROR';
  const isThinking = status === 'THINKING';
  const isStreaming = status === 'STREAMING';

  // Smoothed channels, mirroring the procedural rig. Same shapes, same springs.
  const anim = useRef({ lean: 0, tilt: 0, armLiftR: 0, armLiftL: 0, time: 0 });

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const t = (anim.current.time += dt);
    const a = anim.current;
    const j = animated.current;

    a.lean = spring(a.lean, isThinking ? 1 : isStreaming ? 0.35 : 0, dt, 7);
    a.tilt = spring(a.tilt, isError ? 1 : 0, dt, 6);
    a.armLiftR = spring(a.armLiftR, isStreaming ? 0.55 : 0, dt, 7);
    a.armLiftL = spring(a.armLiftL, isError ? 1 : 0, dt, 7);

    if (j.torso) {
      j.torso.rotation.x = a.lean * 0.3;
      j.torso.position.z = a.lean * 0.07;
      j.torso.scale.y = 1 - a.tilt * 0.04;
    }

    if (j.head) {
      const idleLook = Math.sin(t * 0.5) * 0.3 + Math.sin(t * 0.21) * 0.14;
      const coffeeGlance = Math.sin(t * 0.33) > 0.86 ? 0.42 : 0;
      const look = isThinking ? Math.sin(t * 2.2) * 0.09 : idleLook + coffeeGlance * 0.4;
      j.head.rotation.y = look * (1 - a.tilt);
      j.head.rotation.z = isError ? Math.PI / 4 : a.tilt * 0.12;
      j.head.rotation.x = a.lean * 0.16 + (isThinking ? 0.1 : 0);
      j.head.position.y =
        rest.headY + (isError ? 0 : Math.sin(t * 2.1) * 0.014) + a.lean * 0.02;
    }

    if (j.antenna) {
      const wobble = isError ? 0.5 : isThinking ? 0.2 : 0.09;
      j.antenna.rotation.z = rest.antennaZ + Math.sin(t * (isError ? 9 : 2.3)) * wobble;
      j.antenna.rotation.x = Math.cos(t * (isError ? 7 : 1.7)) * wobble * 0.7;
    }

    // Arms type at the keyboard; the lift channel raises them for the ERROR
    // startle.
    const typeSpeed = isThinking ? 26 : isStreaming ? 14 : 2.4;
    const typeAmp = isThinking ? 0.05 : isStreaming ? 0.03 : 0.006;
    const lPhase = t * typeSpeed;
    const rPhase = t * typeSpeed + 1.9;

    if (j.armL) {
      j.armL.rotation.x = -0.35 - a.armLiftL * 1.5 + Math.sin(lPhase) * typeAmp * 2;
      j.armL.rotation.z = 0.12 + a.armLiftL * 0.85;
    }
    if (j.armR) {
      j.armR.rotation.x = -0.35 - a.armLiftR * 1.45 + Math.sin(rPhase) * typeAmp * 2;
      j.armR.rotation.z = -0.12 - a.armLiftR * 0.6;
    }
  });

  return (
    // Root space of the procedural robot: origin on the chair seat. The clone is
    // aligned inside this group, so `DESK_SEAT` is applied exactly once.
    <group position={[DESK_SEAT.x, DESK_SEAT.y, DESK_SEAT.z]}>
      <primitive object={instance} />
      {/* Identity parts are mounted onto the model's own joints, not at root:
          a shell has to follow the head when it looks around, tilts on ERROR,
          and the antenna wobbles. `RobotIdentityParts`, not `RobotParts`: the
          `.glb` already carries the baked shared body, so adding it again would
          double every block. */}
      {joints.head &&
        createPortal(
          <RobotIdentityParts node="head" identity={identity} accent={identity.color} />,
          joints.head,
        )}
      {joints.antenna &&
        createPortal(<AntennaTopper identity={identity} status={status} />, joints.antenna)}
      {joints.torso &&
        createPortal(
          <RobotIdentityParts node="torso" identity={identity} accent={identity.color} />,
          joints.torso,
        )}
      {/* The comedy belongs to the performance, not the body: the same props
          render for the procedural robot and the model. */}
      <RobotEffects
        status={status}
        towardHub={towardHub}
        tokensPerSecond={tokensPerSecond}
      />
    </group>
  );
}
