'use client';

import dynamic from 'next/dynamic';
import { ControlDock } from '@/components/hud/ControlDock';
import { RobotSpotlightCard, TacticalOverlay } from '@/components/hud/TacticalOverlay';
import { SimulationPanel } from '@/components/hud/SimulationPanel';
import { TelemetryBridge } from '@/components/hud/TelemetryBridge';
import { useMoodShortcuts } from '@/components/hud/useMoodShortcuts';

/**
 * WebGL must never render on the server, so the whole R3F canvas is a
 * client-only chunk. `ssr: false` is legal here because this file is already
 * a Client Component.
 */
const Scene = dynamic(
  () => import('@/components/canvas/Scene').then((mod) => mod.Scene),
  {
    ssr: false,
    loading: () => <CanvasBoot />,
  },
);

function CanvasBoot() {
  return (
    <div className="canvas-host absolute inset-0 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="relative h-12 w-12 animate-toy-bob">
          <span className="absolute inset-0 rounded-xl bg-candy-yellow/40" />
          <span className="absolute inset-2 rounded-lg bg-candy-blue/60" />
          <span className="absolute inset-4 rounded bg-candy-mint" />
        </div>
        <p className="text-[11px] font-extrabold tracking-wide text-ink uppercase">
          Opening the office…
        </p>
      </div>
    </div>
  );
}

export function CommandCenter() {
  // One listener for the whole page: both `MoodGrid` copies are mounted (only
  // one is visible per breakpoint), so a per-component listener would fire the
  // trigger of a hidden copy and leave the visible panel without feedback.
  useMoodShortcuts();

  return (
    <main className="flex h-dvh w-full overflow-hidden bg-office-sky">
      {/* live 9Router polling + simulation fallback */}
      <TelemetryBridge />

      <div className="relative min-w-0 flex-1">
        {/* 3D viewport */}
        <div className="absolute inset-0">
          <Scene />
        </div>

        {/* soft paper-dot texture to keep the bright backdrop playful */}
        <div className="toy-dots pointer-events-none absolute inset-0 z-10 opacity-40" aria-hidden />

        {/* 2D playful HUD: identity + office vitals */}
        <TacticalOverlay />

        {/*
          Bottom strip of the scene column: spotlight plus the sub-`lg` dock.

          They share one absolutely positioned, wrapping flex row because the
          dock's height changes with the viewport (it wraps), so only the
          browser can keep the two from colliding at every width. The spotlight
          is `xl:block` because at 768-1279px it is tall enough to reach the
          identity card when the dock is also in this strip; from `xl` up the
          dock is gone and it sits alone at bottom-left.
        */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex flex-wrap items-end justify-start gap-3 px-3 pb-3 sm:gap-4 sm:px-5 sm:pb-4">
          <div className="pointer-events-auto hidden w-[min(90vw,280px)] shrink-0 xl:block">
            <RobotSpotlightCard />
          </div>

          <div className="pointer-events-auto min-w-0 flex-1 basis-[860px] lg:hidden">
            <ControlDock />
          </div>
        </div>

        {/* screen-reader description of the scene */}
        <p className="sr-only">
          Interactive 3D isometric office diorama. Four blocky worker robots sit at
          colourful desks around a central 9Router server hub, and each robot&apos;s
          face and posture reflects its routing status. Use the simulation mode
          controls to set robots to IDLE, THINKING, STREAMING, or ERROR.
          Keyboard shortcuts 1 through 4 trigger the same states.
        </p>
      </div>

      {/* simulation controls: the side panel owns every control from `lg` up */}
      <div className="hidden shrink-0 p-3 lg:block">
        <SimulationPanel />
      </div>
    </main>
  );
}
