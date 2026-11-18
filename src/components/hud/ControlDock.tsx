'use client';

import { Pause, Play, RotateCcw, Sparkles } from 'lucide-react';
import { useAgentStore } from '@/store/useAgentStore';
import { playConfirm, playToggle } from '@/lib/audio';
import { cn } from '@/lib/format';
import { CameraMenu } from './CameraMenu';
import { ModelToggle } from './ModelToggle';
import { MoodGrid } from './MoodGrid';
import { SoundToggle } from './SoundToggle';

/**
 * Narrow-viewport fallback for the simulation panel (`< lg`).
 *
 * It owns no mood logic of its own: `MoodGrid` is the one implementation, and
 * the 1..4 shortcuts live in `useMoodShortcuts` so a hidden copy of this dock
 * can never answer a keypress meant for the visible controls.
 */
export function ControlDock() {
  const simulationMode = useAgentStore((s) => s.simulationMode);
  const setSimulationMode = useAgentStore((s) => s.setSimulationMode);
  const resetTelemetry = useAgentStore((s) => s.resetTelemetry);

  return (
    <section
      aria-label="Simulation mode control dock"
      className="toy-card pointer-events-auto flex max-h-[calc(100dvh-9rem)] w-full flex-col overflow-hidden"
    >
      {/* header */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b-2 border-card-border/70 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-xl',
              simulationMode ? 'bg-candy-mint/20' : 'bg-card-soft',
            )}
            aria-hidden
          >
            <Sparkles
              className={cn(
                'h-4 w-4',
                simulationMode ? 'text-candy-mint animate-toy-bob' : 'text-ink-dim',
              )}
              strokeWidth={2.4}
            />
          </span>
          <div>
            <h2 className="text-[13px] font-bold tracking-tight text-ink-strong">
              Simulation Mode
            </h2>
            <p className="text-[11px] font-medium text-ink-dim">
              {simulationMode ? 'Live mock telemetry' : 'Paused'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Display options"
            className="flex items-center gap-1 rounded-xl border-2 border-card-border/70 bg-card-soft/70 p-1"
          >
            <SoundToggle />
            <ModelToggle />
          </div>

          <button
            type="button"
            onClick={() => {
              setSimulationMode(!simulationMode);
              playToggle();
            }}
            aria-pressed={simulationMode}
            className={cn(
              'toy-btn flex min-h-9 cursor-pointer items-center gap-1.5 px-3 text-[12px] font-bold',
              simulationMode
                ? 'border-candy-mint/50 bg-candy-mint/15 text-[#2f8f6d]'
                : 'text-ink',
            )}
          >
            {simulationMode ? (
              <Pause className="h-3.5 w-3.5" strokeWidth={2.6} aria-hidden />
            ) : (
              <Play className="h-3.5 w-3.5" strokeWidth={2.6} aria-hidden />
            )}
            {simulationMode ? 'Pause' : 'Resume'}
          </button>

          <button
            type="button"
            onClick={() => {
              // Reset restores the simulation roster; claim the mode first.
              setSimulationMode(true);
              resetTelemetry();
              playConfirm();
            }}
            className="toy-btn flex min-h-9 cursor-pointer items-center gap-1.5 px-3 text-[12px] font-bold text-ink"
          >
            <RotateCcw className="h-3.5 w-3.5" strokeWidth={2.6} aria-hidden />
            Reset
          </button>
        </div>
      </header>

      {/*
        This dock is an absolutely positioned bottom layer (`z-30`) while the
        top HUD cards are a separate `z-20` layer, so nothing in the layout flow
        stops a tall dock from painting over them: the section caps its own
        height and the overflow has to be absorbed in here.

        That cap can bind at any width — a short landscape window (768x320) hits
        it exactly like a phone does — so the body must stay a shrinkable
        `flex-1` item at every breakpoint, and the mood grid must keep its own
        scroller there too. A body that held its content height would push the
        overflow past the cap, where `overflow-hidden` on the section turns it
        into a clipped region with no scroll path and the lower mood cells
        become unreachable.

        The camera presets need no such protection: they are a sibling grid item
        outside the mood scroller, so scrolling the mood grid never moves them.
      */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 px-4 py-3 sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,200px)] sm:grid-rows-[minmax(0,1fr)] sm:gap-3">
        <div className="toy-scroll min-h-0 flex-1 overflow-y-auto">
          <MoodGrid />
        </div>
        {/* Camera presets live in the panel from `lg` up; the dock is the only
            place to reach them below it, so it must keep them — compact keeps
            the dock short enough to not crowd the mood grid. */}
        <CameraMenu compact />
      </div>
    </section>
  );
}
