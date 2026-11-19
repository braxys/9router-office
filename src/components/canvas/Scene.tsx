'use client';

import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { ComponentRef } from 'react';
import dynamic from 'next/dynamic';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import { useShallow } from 'zustand/react/shallow';
import * as THREE from 'three';
import { useAgentStore } from '@/store/useAgentStore';
import { useUiStore } from '@/store/useUiStore';
import { AGENT_SLOTS, STATUS_META } from '@/lib/agents';
import { markFrame } from '@/lib/renderStats';
import { useModelChoice } from '@/lib/modelChoice';
import {
  isCameraAnimating,
  setCameraAnimating,
  subscribeCamera,
} from '@/lib/cameraBus';
import type { CameraPreset } from '@/lib/cameraBus';
import { WorkerRobot } from './WorkerRobot';
import { WorkDesk } from './WorkDesk';
import { CentralHub } from './CentralHub';
import { OfficeRoom } from './OfficeRoom';

/**
 * The `.glb` body is a separate chunk: `GLTFLoader` is only fetched when someone
 * actually opts into the model, so the default path stays exactly as cheap as
 * before.
 */
const ModelRobot = dynamic(
  () => import('./ModelRobot').then((mod) => mod.ModelRobot),
  { ssr: false },
);

/* -------------------------------------------------------------------------- */
/*  Chair colours — one playful colour per desk                               */
/* -------------------------------------------------------------------------- */

const CHAIR_COLORS = ['#ffc94d', '#ff9d5c', '#5cb8f2', '#ff8fa3'];

/**
 * Screenshot harnesses read the canvas after the frame ends, when WebGL has
 * already discarded the drawing buffer. `?capture=1` asks the driver to keep
 * it; normal play keeps the cheaper default.
 */
const CAPTURE_MODE =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('capture');

/* -------------------------------------------------------------------------- */
/*  Fake blob shadow — cheap circle on the floor                              */
/* -------------------------------------------------------------------------- */

function BlobShadow({
  position,
  radius = 0.7,
  opacity = 0.18,
}: {
  position: [number, number, number];
  radius?: number;
  opacity?: number;
}) {
  return (
    <mesh position={[position[0], 0.02, position[2]]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[radius, 20]} />
      <meshBasicMaterial color="#000000" transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
}

/* -------------------------------------------------------------------------- */
/*  Per-agent node                                                            */
/* -------------------------------------------------------------------------- */

function AgentNode({
  id,
  chairColor,
  slot,
  model,
}: {
  id: string;
  chairColor: string;
  slot: (typeof AGENT_SLOTS)[number];
  /** `null` keeps the procedural robot; a url swaps in the `.glb` body. */
  model: { url: string } | null;
}) {
  const group = useRef<THREE.Group>(null);
  const selected = useAgentStore((s) => s.selectedAgentId === id);
  const selectAgent = useAgentStore((s) => s.selectAgent);
  // Primitive selectors: a telemetry tick that only moves latency must not
  // re-render this subtree, because every render invalidates the demand loop.
  const name = useAgentStore(
    (s) => s.agents.find((a) => a.id === id)?.name ?? id,
  );
  const accentColor = useAgentStore(
    (s) => s.agents.find((a) => a.id === id)?.accentColor ?? '#5CB8F2',
  );
  const status = useAgentStore(
    (s) => s.agents.find((a) => a.id === id)?.status ?? 'IDLE',
  );
  const tokensPerSecond = useAgentStore(
    (s) => s.agents.find((a) => a.id === id)?.tokensPerSecond ?? 0,
  );
  // Both are strings, so zustand's default `Object.is` comparison keeps a
  // latency-only telemetry tick from re-rendering this subtree.
  const lastError = useAgentStore(
    (s) => s.agents.find((a) => a.id === id)?.lastError ?? '',
  );
  const dismissed = useUiStore((s) => s.dismissedErrors[id]);
  const dismissError = useUiStore((s) => s.dismissError);
  const clearDismissedError = useUiStore((s) => s.clearDismissedError);
  const showBubble = lastError !== '' && dismissed !== lastError;

  // A dismissal is only meaningful while the failure it dismissed still exists.
  // Once the provider recovers, forget it: otherwise a later failure that
  // happens to format to the same text — live codebuddy's carries no reset
  // date, so it is byte-identical every time — would never show a bubble again.
  useEffect(() => {
    if (lastError === '') clearDismissedError(id);
  }, [clearDismissedError, id, lastError]);

  // The drei portal is appended to `events.connected`, which is the very
  // element R3F and `OrbitControls` listen on, and both read `offsetX/offsetY`
  // rather than `event.target`. React handlers run too late — React delegates
  // at the root — so a click on the bubble would also select the desk and a
  // drag on it would orbit the camera. Native listeners on the bubble itself
  // stop the event before either listener sees it.
  //
  // Two consequences shape the code below:
  //
  //   1. This must be a callback ref, not a `useEffect` keyed on visibility.
  //      drei renders the `<Html>` children into its own React root, so when
  //      this component's effect runs the bubble has not been attached yet and
  //      `ref.current` is still null. The effect never runs again (visibility
  //      flips once), which silently left the guard off.
  //   2. The dismissal cannot be a React `onClick`. The guard stops the click
  //      at this element, which sits *below* the React root drei created for
  //      the portal, so the delegated handler would never fire. It is handled
  //      natively here instead; a `<button>` still turns Enter and Space into
  //      a click, so keyboard dismissal keeps working.
  const bubbleGuard = useRef<(() => void) | null>(null);
  const attachBubbleGuard = useCallback(
    (el: HTMLDivElement | null) => {
      bubbleGuard.current?.();
      bubbleGuard.current = null;
      if (!el) return;

      const stop = (event: Event) => event.stopPropagation();
      const dismiss = (event: Event) => {
        const target = event.target;
        if (!(target instanceof Element) || !target.closest('[data-error-dismiss]')) return;
        dismissError(id, lastError);
      };

      el.addEventListener('pointerdown', stop);
      el.addEventListener('click', stop);
      el.addEventListener('dblclick', stop);
      el.addEventListener('wheel', stop, { passive: true });
      el.addEventListener('click', dismiss);
      bubbleGuard.current = () => {
        el.removeEventListener('pointerdown', stop);
        el.removeEventListener('click', stop);
        el.removeEventListener('dblclick', stop);
        el.removeEventListener('wheel', stop);
        el.removeEventListener('click', dismiss);
      };
    },
    [dismissError, id, lastError],
  );

  useEffect(() => () => bubbleGuard.current?.(), []);

  // Direction from this desk toward the central hub, in the desk's local
  // space (desks are not rotated, so this is just the negated slot vector).
  const towardHub = useMemo<[number, number]>(() => {
    const [x, , z] = slot.position;
    const len = Math.hypot(x, z) || 1;
    return [-x / len, -z / len];
  }, [slot.position]);

  useFrame((_, delta) => {
    if (!group.current) return;
    const dt = Math.min(delta, 0.05);
    // Selected desk pops up slightly — a friendly "I'm listening" cue.
    const target = selected ? 1.04 : 1;
    const s = group.current.scale.x + (target - group.current.scale.x) * Math.min(1, dt * 6);
    group.current.scale.setScalar(s);
  });

  return (
    <group
      ref={group}
      position={slot.position}
      rotation={[0, slot.rotationY, 0]}
      onClick={(event) => {
        event.stopPropagation();
        selectAgent(id);
      }}
    >
      <WorkDesk accentColor={accentColor} status={status} chairColor={chairColor} />
      {model ? (
        // The model body sits in the same slot. `ModelRobot` loads the file
        // imperatively and renders this same procedural robot until the file is
        // ready (and forever, if it fails), so no Suspense boundary is needed.
        <ModelRobot
          url={model.url}
          accentColor={accentColor}
          status={status}
          towardHub={towardHub}
          tokensPerSecond={tokensPerSecond}
          fallback={
            <WorkerRobot
              accentColor={accentColor}
              status={status}
              towardHub={towardHub}
              tokensPerSecond={tokensPerSecond}
            />
          }
        />
      ) : (
        <WorkerRobot
          accentColor={accentColor}
          status={status}
          towardHub={towardHub}
          tokensPerSecond={tokensPerSecond}
        />
      )}

      {/* name + mood pill, floating over the robot's antenna.
          No `distanceFactor`: drei then keeps the pill at a constant CSS size,
          so it stays legible in the overview and does not balloon when the
          camera flies in for a focus shot. */}
      <Html
        position={[0, 2.45, -0.3]}
        center
        zIndexRange={[15, 0]}
        pointerEvents="none"
        style={{ pointerEvents: 'none' }}
      >
        <div style={{ position: 'relative' }}>
          {showBubble && (
            <div
              ref={attachBubbleGuard}
              className="absolute bottom-[calc(100%+8px)] left-1/2 flex w-max max-w-[210px] -translate-x-1/2 items-start gap-1.5 rounded-2xl border-2 px-2 py-1.5"
              style={{
                backgroundColor: 'rgba(255, 253, 248, 0.97)',
                borderColor: '#FF6B7A',
                boxShadow: '0 2px 0 #FF6B7A33',
                pointerEvents: 'auto',
              }}
            >
              <span className="text-[10px] leading-tight font-extrabold text-[#c23a4c]">
                {lastError}
              </span>
              <button
                type="button"
                data-error-dismiss
                aria-label={`Dismiss error for ${name}`}
                className="shrink-0 cursor-pointer rounded-full px-1 text-[10px] leading-none font-extrabold text-[#c23a4c] hover:bg-[#FF6B7A]/15"
              >
                ✕
              </button>
              <span
                className="absolute top-full left-1/2 h-0 w-0 -translate-x-1/2 border-x-[5px] border-t-[6px] border-x-transparent"
                style={{ borderTopColor: '#FF6B7A' }}
                aria-hidden
              />
            </div>
          )}
          <div
            data-robot-pill
            className="flex items-center gap-1.5 rounded-full border-2 px-2.5 py-1 whitespace-nowrap"
            style={{
              backgroundColor: 'rgba(255, 253, 248, 0.94)',
              borderColor: `${STATUS_META[status].color}88`,
              boxShadow: `0 2px 0 ${STATUS_META[status].color}33`,
            }}
          >
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: STATUS_META[status].color }}
              aria-hidden
            />
            <span className="text-[10px] font-extrabold tracking-tight text-ink-strong">
              {name}
            </span>
            <span
              className="text-[9px] font-extrabold tracking-wide uppercase"
              style={{ color: STATUS_META[status].color }}
            >
              {STATUS_META[status].label}
            </span>
          </div>
        </div>
      </Html>

      {/* fake blob shadow under robot + desk */}
      <BlobShadow position={[0, 0, 0]} radius={0.9} opacity={0.15} />

      {/* selection ring on the floor */}
      {selected && (
        <mesh position={[0, 0.03, 0.3]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.05, 1.2, 40]} />
          <meshBasicMaterial color={accentColor} transparent opacity={0.55} />
        </mesh>
      )}
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/*  Camera rig — intro framing, presets, then free orbit                       */
/* -------------------------------------------------------------------------- */

/** Preset flights are brisk; the opening dolly is slower so it reads as an intro. */
const CAMERA_FLIGHT_S = 0.9;
const CAMERA_INTRO_S = 1.8;

interface CameraPose {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

/**
 * Fixed poses are module constants: the flight loop only copies them, so no
 * vector is ever allocated between frames.
 */
const CAMERA_POSES: Record<'overview' | 'hub', CameraPose> = {
  overview: {
    position: new THREE.Vector3(8.6, 9.2, 10.8),
    target: new THREE.Vector3(0, 1.5, -0.4),
  },
  hub: {
    position: new THREE.Vector3(5.2, 6.0, 6.6),
    target: new THREE.Vector3(0, 1.2, 0),
  },
};

/** Where the first frame starts, before the intro dolly settles on overview. */
const CAMERA_INTRO_START = new THREE.Vector3(12.5, 13.0, 15.5);

/** Framing the office was designed at: the vertical fov below assumes this shape. */
const BASE_FOV = 38;
const REF_ASPECT = 1.1;
/**
 * Where the right-most robot's name pill sits under the reference framing, as a
 * fraction of the canvas width, and half its width in CSS pixels.
 *
 * The pill is a fixed-size DOM element — drei's `<Html>` has no `distanceFactor`
 * — so it does not shrink with the scene the way the desks do. Both numbers
 * follow from the camera pose and the desk layout; the layout gate asserts all
 * four pills stay inside the canvas, so a change to either surfaces at once.
 */
const RIGHT_PILL_FRAC = 0.903;
const RIGHT_PILL_HALF_PX = 60;

/**
 * Keeps the office framed when the canvas is narrower than the design.
 *
 * The camera's fov is vertical, so it is the *horizontal* field that shrinks
 * when the simulation panel takes 344px off the viewport: at 1024x900 the
 * canvas is 680x900, and a 38° vertical fov across that aspect crops the
 * right-most desk (Antigravity) off screen entirely. Widening the vertical fov
 * instead holds the horizontal field constant, so the whole office fits —
 * the scene reads as smaller rather than as cut off.
 *
 * That alone is enough down to a ~585px canvas. Below it the pills take over:
 * they keep their pixel width while the canvas shrinks around them, so on a
 * phone the right-most one overhangs the edge however the desks are framed.
 * There the field opens up by exactly the ratio that leaves the pill inside.
 *
 * Kept out of `CameraRig` on purpose: that effect is mount-only and owns the
 * intro flight, while this has to re-run on every canvas resize.
 */
function fovForViewport(width: number, height: number) {
  const aspect = width / height;
  // At or above the reference aspect the baseline framing is already wide
  // enough for every desk, so wide viewports stay byte-identical to before.
  if (aspect >= REF_ASPECT) return BASE_FOV;

  const refTan = Math.tan((BASE_FOV * Math.PI) / 360) * REF_ASPECT;
  // Widening the field by `k` pulls the pill towards the centre in proportion,
  // landing it at `0.5 + (RIGHT_PILL_FRAC - 0.5) / k`. It fits once that plus
  // its half-width clears the edge; `k` of 1 means the constant-horizontal-fov
  // framing already does, which is every canvas wider than ~585px.
  const room = 0.5 - RIGHT_PILL_HALF_PX / Math.max(width, RIGHT_PILL_HALF_PX * 2);
  const fit = room > 0 ? (RIGHT_PILL_FRAC - 0.5) / room : 1;

  return (2 * Math.atan((refTan * Math.max(1, fit)) / aspect) * 180) / Math.PI;
}

/**
 * Three cameras are imperative objects owned by the renderer, not React state:
 * the projection is written in place, the way `OrbitControls` writes the
 * camera transform. A module-scope function keeps that write where lint can
 * see it is not mutating a value React owns.
 */
function applyFov(camera: THREE.Camera, fov: number) {
  const perspective = camera as THREE.PerspectiveCamera;
  perspective.fov = fov;
  perspective.updateProjectionMatrix();
}

function ResponsiveFov() {
  const { camera, size, invalidate } = useThree();

  useEffect(() => {
    applyFov(camera, fovForViewport(size.width, size.height));
    // `frameloop="demand"`: without this the new projection may never paint.
    invalidate();
  }, [camera, size.width, size.height, invalidate]);

  return null;
}

function CameraRig() {
  const { camera, invalidate } = useThree();
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  // Scratch vectors for the computed focus pose; beginFlight copies them.
  const focusPos = useRef(new THREE.Vector3());
  const focusTarget = useRef(new THREE.Vector3());

  // Everything a flight needs, allocated once.
  const flight = useRef({
    active: false,
    t: 0,
    duration: CAMERA_FLIGHT_S,
    fromPos: new THREE.Vector3(),
    fromTarget: new THREE.Vector3(),
    toPos: new THREE.Vector3(),
    toTarget: new THREE.Vector3(),
    lookTarget: new THREE.Vector3(),
  });

  /**
   * Hands the camera to the flight loop and parks OrbitControls.
   *
   * While enabled, drei calls `controls.update()` every frame, and every
   * `change` it emits runs `invalidate()` — that pins the demand loop at the
   * display refresh rate. Disabling for the duration keeps the dynamic budget
   * (and the ~28 FPS camera boost) in charge.
   */
  const beginFlight = (
    toPos: THREE.Vector3,
    toTarget: THREE.Vector3,
    duration: number,
  ) => {
    const f = flight.current;
    const c = controls.current;

    f.fromPos.copy(camera.position);
    // A preset clicked mid-flight must resume from where the camera is
    // *looking* now, not from the orbit target it left behind.
    if (f.active) f.fromTarget.copy(f.lookTarget);
    else if (c) f.fromTarget.copy(c.target);
    else f.fromTarget.set(0, 1.5, -0.4);

    f.toPos.copy(toPos);
    f.toTarget.copy(toTarget);
    f.t = 0;
    f.duration = duration;
    f.active = true;

    if (c) c.enabled = false;
    setCameraAnimating(true);
    invalidate();
  };

  useLayoutEffect(() => {
    camera.position.copy(CAMERA_INTRO_START);
    camera.lookAt(CAMERA_POSES.overview.target);
    beginFlight(
      CAMERA_POSES.overview.position,
      CAMERA_POSES.overview.target,
      CAMERA_INTRO_S,
    );
    // Runs once on mount; beginFlight only touches refs and module constants.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera]);

  useEffect(
    () =>
      subscribeCamera((preset: CameraPreset) => {
        if (preset === 'focus') {
          // Aim at the selected desk from the front, just past minDistance.
          const state = useAgentStore.getState();
          const index = Math.max(
            0,
            state.agents.findIndex((a) => a.id === state.selectedAgentId),
          );
          const [x, , z] = AGENT_SLOTS[index % AGENT_SLOTS.length].position;
          focusPos.current.set(x * 1.35, 3.8, z + 6.8);
          focusTarget.current.set(x, 1.05, z);
          beginFlight(focusPos.current, focusTarget.current, CAMERA_FLIGHT_S);
          return;
        }
        const pose = CAMERA_POSES[preset];
        beginFlight(pose.position, pose.target, CAMERA_FLIGHT_S);
      }),
    // beginFlight is stable in practice (refs + module constants only).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [camera, invalidate],
  );

  useFrame((_, delta) => {
    const f = flight.current;
    if (!f.active) return;

    f.t = Math.min(1, f.t + delta / f.duration);
    // Smoothstep: no ease-in jerk, no hard stop.
    const e = f.t * f.t * (3 - 2 * f.t);
    camera.position.lerpVectors(f.fromPos, f.toPos, e);

    // Orient by hand for the same reason the controls are parked.
    f.lookTarget.lerpVectors(f.fromTarget, f.toTarget, e);
    camera.lookAt(f.lookTarget);

    if (f.t < 1) return;

    f.active = false;
    const c = controls.current;
    if (c) {
      c.target.copy(f.toTarget);
      c.enabled = true;
      // One sync at the end so the orbit maths agrees with the new pose.
      c.update();
    }
    setCameraAnimating(false);
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      target={[0, 1.5, -0.4]}
      enableDamping
      dampingFactor={0.08}
      minDistance={7}
      maxDistance={30}
      minPolarAngle={0.35}
      maxPolarAngle={Math.PI / 2.35}
      enablePan={false}
      rotateSpeed={0.5}
      zoomSpeed={0.8}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*  Dynamic FPS limiter + tab-visibility sleep                                */
/* -------------------------------------------------------------------------- */

/** Minimum ms between rendered frames — varies by activity level. */
const IDLE_FRAME_MS = 1000 / 30; // 30 FPS when all idle
const ACTIVE_FRAME_MS = 1000 / 28; // ~28 FPS when any agent is active

function PerformanceManager() {
  // Runs once per rendered frame, so the HUD reports real draw rate.
  useFrame(() => markFrame());

  const invalidate = useThree((s) => s.invalidate);
  const anyActive = useAgentStore((s) =>
    s.agents.some(
      (a) =>
        a.status === 'THINKING' ||
        a.status === 'STREAMING' ||
        a.status === 'ERROR',
    ),
  );

  // Written from an effect, never during render.
  const activeRef = useRef(false);
  useEffect(() => {
    activeRef.current = anyActive;
  }, [anyActive]);

  useEffect(() => {
    let raf = 0;
    let last = 0;
    let elapsed = 0;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      // Tab hidden: stop invalidating, so R3F stops drawing entirely.
      if (document.hidden) {
        last = now;
        elapsed = 0;
        return;
      }

      // rAF ticks land on display refresh boundaries, so a frame budget rarely
      // divides evenly. Allow half a refresh of slack: without it, 35.7 ms on a
      // 60 Hz display slips to 3 ticks (~19 FPS) instead of 2 (~29 FPS).
      const step = last ? now - last : 1000 / 60;
      last = now;
      elapsed += step;

      // A camera flight needs the active budget even when every robot is idle.
      const budget =
        activeRef.current || isCameraAnimating() ? ACTIVE_FRAME_MS : IDLE_FRAME_MS;
      if (elapsed + step / 2 < budget) return;

      elapsed = 0;
      invalidate();
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [invalidate]);

  return null;
}

/* -------------------------------------------------------------------------- */
/*  World                                                                     */
/* -------------------------------------------------------------------------- */

function World() {
  // Every subscription here is compared by *value*: zustand's `useShallow`
  // compares array elements, not array identity. A telemetry tick rebuilds the
  // roster array twice a second even when nothing visible changed, and any
  // re-render inside <Canvas> invalidates the demand loop — that quietly added
  // ~2 frames/s to the idle budget.
  const ids = useAgentStore(useShallow((s) => s.agents.map((a) => a.id)));
  const statuses = useAgentStore(useShallow((s) => s.agents.map((a) => a.status)));
  const colors = useAgentStore(useShallow((s) => s.agents.map((a) => a.accentColor)));
  // Presentation preference + `?model=`; both are hydration-safe reads, so the
  // body choice needs no state of its own.
  const modelChoice = useModelChoice();
  const modelUrl = modelChoice.kind === 'model' ? modelChoice.url : null;

  // A rejected `?model=` value warns exactly once, from an effect (render must
  // stay side-effect free). Keyed by the warning text so it cannot repeat.
  const warning = modelChoice.warning;
  useEffect(() => {
    if (warning) console.warn(warning);
  }, [warning]);
  // Same rule as the HUD vitals card: anything that is not idle and not failed
  // counts as working. Keeping both labels on one definition avoids the hub
  // disagreeing with the HUD about how many robots are busy.
  const activeAgents = statuses.filter(
    (status) => status !== 'IDLE' && status !== 'ERROR',
  ).length;

  return (
    <>
      {/* bright sky backdrop */}
      <color attach="background" args={['#bfe6ff']} />
      <fog attach="fog" args={['#dcefff', 26, 52]} />

      {/* ---------- daylight ---------- */}
      {/* Warm sun does most of the work; the ambient is kept low enough that
          shadows still read as shadows instead of washing out. */}
      <ambientLight intensity={0.68} color="#fffaf2" />
      <hemisphereLight args={['#ffffff', '#f7e6cd', 0.5]} />

      {/* warm sun through the windows */}
      <directionalLight
        position={[-9, 14, 11]}
        intensity={1.7}
        color="#fff4e0"
      />

      {/* fill from the open +X side — this is what lights the visible left wall */}
      <directionalLight position={[12, 7, 10]} intensity={0.85} color="#eaf6ff" />
      <directionalLight position={[0, 6, -12]} intensity={0.35} color="#fff0dc" />

      {/* ---------- the office ---------- */}
      <OfficeRoom />

      <CentralHub
        activeAgents={activeAgents}
        totalAgents={ids.length}
        statuses={statuses}
        colors={colors}
      />
      {/* blob shadow under central hub */}
      <BlobShadow position={[0, 0, 0]} radius={1.4} opacity={0.12} />

      {ids.map((id, index) => (
        <AgentNode
          key={id}
          id={id}
          chairColor={CHAIR_COLORS[index % CHAIR_COLORS.length]}
          slot={AGENT_SLOTS[index % AGENT_SLOTS.length]}
          model={modelUrl ? { url: modelUrl } : null}
        />
      ))}

      <CameraRig />
      <ResponsiveFov />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Canvas shell                                                              */
/* -------------------------------------------------------------------------- */

export function Scene() {
  const tick = useAgentStore((s) => s.tick);

  return (
    <div className="canvas-host absolute inset-0">
      <Canvas
        dpr={1}
        gl={{
          antialias: false,
          alpha: false,
          preserveDrawingBuffer: CAPTURE_MODE,
          powerPreference: 'low-power',
          // Neutral keeps the pastel toy palette saturated; ACES desaturates it.
          toneMapping: THREE.NeutralToneMapping,
        }}
        frameloop="demand"
        camera={{ position: [12.5, 13.0, 15.5], fov: 38, near: 0.1, far: 120 }}
        onCreated={({ gl }) => {
          gl.toneMappingExposure = 1.0;
        }}
      >
        <Suspense fallback={null}>
          <World />
        </Suspense>
        <PerformanceManager />
        <SimulationClock onTick={tick} />
      </Canvas>
    </div>
  );
}

/**
 * Drives the mock telemetry tick without re-rendering React.
 */
function SimulationClock({ onTick }: { onTick: (now: number) => void }) {
  const last = useRef(0);
  useFrame(() => {
    const now = performance.now();
    if (now - last.current > 500) {
      last.current = now;
      onTick(now);
    }
  });
  return null;
}
