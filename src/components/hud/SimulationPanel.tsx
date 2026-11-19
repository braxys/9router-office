'use client';

import { ChevronsRight, Monitor, Pause, Play, RotateCcw } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useAgentStore } from '@/store/useAgentStore';
import { useUiStore } from '@/store/useUiStore';
import { playClick, playConfirm, playToggle } from '@/lib/audio';
import { cn } from '@/lib/format';
import { CameraMenu } from './CameraMenu';
import { ModelToggle } from './ModelToggle';
import { MoodGrid } from './MoodGrid';
import { ProviderPicker } from './ProviderPicker';
import { SoundToggle } from './SoundToggle';
import { MoodLogCard } from './TacticalOverlay';
import { PANEL_RAIL_WIDTH, PANEL_WIDTH } from '@/lib/hudLayout';

/**
 * Simulation controls for `lg` and up, floating over the right-hand side of the
 * full-bleed scene.
 *
 * The width comes from `PANEL_WIDTH` rather than a utility class because the
 * camera framing is tuned against that number (`visibleSceneWidth()` subtracts
 * this panel's footprint from the canvas width), so the two must not drift.
 *
 * Every section brings its own heading, so the panel only supplies the
 * grouping: adding a "Mood" title above `MoodGrid` would duplicate the
 * "Picu mood" heading that component already owns.
 *
 * Collapsed, the same `<aside>` becomes a rail holding one logo button. The rail
 * footprint is what `visibleSceneWidth()` and the camera switch to, so the fold
 * gives the office its space back instead of leaving a 300px hole.
 */
export function SimulationPanel() {
  const simulationMode = useAgentStore((s) => s.simulationMode);
  const setSimulationMode = useAgentStore((s) => s.setSimulationMode);
  const resetTelemetry = useAgentStore((s) => s.resetTelemetry);
  const collapsed = useUiStore((s) => s.panelCollapsed);
  const togglePanelCollapsed = useUiStore((s) => s.togglePanelCollapsed);

  // The button that was pressed unmounts when the panel folds, so focus falls
  // back to <body> and a keyboard user has to tab through the whole HUD to find
  // the panel again. Hand focus to the control that replaced it instead.
  const toggleRef = useRef<HTMLButtonElement>(null);
  const hasMounted = useRef(false);
  useEffect(() => {
    // Skip the mount render: stealing focus on load would scroll the page and
    // move the user's caret for no reason.
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }
    toggleRef.current?.focus();
  }, [collapsed]);

  if (collapsed) {
    return (
      <aside
        aria-label="Simulation panel"
        className="toy-card flex shrink-0 flex-col items-center p-2"
        style={{ width: PANEL_RAIL_WIDTH }}
      >
        <button
          ref={toggleRef}
          type="button"
          onClick={() => {
            togglePanelCollapsed();
            playClick();
          }}
          aria-label="Buka panel simulasi"
          aria-expanded={false}
          className="toy-btn flex h-10 w-10 cursor-pointer items-center justify-center"
        >
          <Monitor className="h-5 w-5 text-candy-blue" strokeWidth={2.4} aria-hidden />
        </button>
      </aside>
    );
  }

  return (
    <aside
      aria-label="Simulation panel"
      className="toy-card toy-scroll flex max-h-[calc(100dvh-2rem)] shrink-0 flex-col gap-3 overflow-y-auto p-3"
      style={{ width: PANEL_WIDTH }}
    >
      <div className="flex items-center gap-1.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-candy-blue/20">
          <Monitor className="h-3.5 w-3.5 text-candy-blue" strokeWidth={2.4} aria-hidden />
        </span>
        <p className="min-w-0 flex-1 truncate text-[10px] font-extrabold tracking-wide text-ink-dim uppercase">
          Panel simulasi
        </p>
        <button
          ref={toggleRef}
          type="button"
          onClick={() => {
            togglePanelCollapsed();
            playClick();
          }}
          aria-label="Lipat panel simulasi"
          aria-expanded
          className="toy-btn flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center text-ink"
        >
          <ChevronsRight className="h-3.5 w-3.5" strokeWidth={2.8} aria-hidden />
        </button>
      </div>

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
