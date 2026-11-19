'use client';

import { Pause, Play, RotateCcw } from 'lucide-react';
import { useAgentStore } from '@/store/useAgentStore';
import { playConfirm, playToggle } from '@/lib/audio';
import { cn } from '@/lib/format';
import { CameraMenu } from './CameraMenu';
import { ModelToggle } from './ModelToggle';
import { MoodGrid } from './MoodGrid';
import { ProviderPicker } from './ProviderPicker';
import { SoundToggle } from './SoundToggle';
import { MoodLogCard } from './TacticalOverlay';

/**
 * Simulation controls for `lg` and up, as a fixed right-hand column.
 *
 * Every section brings its own heading, so the panel only supplies the
 * grouping: adding a "Mood" title above `MoodGrid` would duplicate the
 * "Picu mood" heading that component already owns.
 */
export function SimulationPanel() {
  const simulationMode = useAgentStore((s) => s.simulationMode);
  const setSimulationMode = useAgentStore((s) => s.setSimulationMode);
  const resetTelemetry = useAgentStore((s) => s.resetTelemetry);

  return (
    <aside
      aria-label="Simulation panel"
      className="toy-card toy-scroll flex max-h-[calc(100dvh-2rem)] w-[320px] shrink-0 flex-col gap-3 overflow-y-auto p-3"
    >
      <ProviderPicker />
      <CameraMenu />
      <MoodGrid compact />
      <MoodLogCard />

      <footer className="flex flex-col gap-2 border-t-2 border-card-border/70 pt-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setSimulationMode(!simulationMode);
              playToggle();
            }}
            aria-pressed={simulationMode}
            className={cn(
              'toy-btn flex min-h-9 flex-1 cursor-pointer items-center justify-center gap-1.5 px-3 text-[12px] font-bold',
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
            className="toy-btn flex min-h-9 flex-1 cursor-pointer items-center justify-center gap-1.5 px-3 text-[12px] font-bold text-ink"
          >
            <RotateCcw className="h-3.5 w-3.5" strokeWidth={2.6} aria-hidden />
            Reset
          </button>
        </div>

        <div
          role="group"
          aria-label="Display options"
          className="flex items-center justify-center gap-1 rounded-xl border-2 border-card-border/70 bg-card-soft/70 px-2 py-1"
        >
          <SoundToggle />
          <ModelToggle />
        </div>
      </footer>
    </aside>
  );
}
