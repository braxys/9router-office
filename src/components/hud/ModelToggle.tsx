'use client';

import { Box, Boxes, TriangleAlert } from 'lucide-react';
import { playToggle } from '@/lib/audio';
import { useModelChoice } from '@/lib/modelChoice';
import { useUiStore } from '@/store/useUiStore';
import { cn } from '@/lib/format';

/**
 * Switches the office between the procedural robot (default) and the generated
 * `.glb` model. Purely presentational: the telemetry store is untouched.
 *
 * Both the pressed state and the "pinned" lock come from `useModelChoice`, so a
 * `?model=` URL is reflected truthfully even when the stored preference says
 * otherwise.
 */
export function ModelToggle() {
  const useModel = useUiStore((s) => s.useModel);
  const modelError = useUiStore((s) => s.modelError);
  const setUseModel = useUiStore((s) => s.setUseModel);
  const choice = useModelChoice();

  const failed = modelError !== null;
  const active = choice.kind === 'model';
  // A pinned choice cannot be changed from the HUD; the button explains why.
  const pinned = choice.pinned;

  return (
    <button
      type="button"
      disabled={pinned}
      onClick={() => {
        if (pinned) return;
        setUseModel(!useModel);
        playToggle();
      }}
      aria-pressed={failed ? false : active}
      aria-label={
        failed
          ? 'The 3D model failed to load — using the procedural robot'
          : active
            ? 'Use the procedural robot'
            : 'Use the 3D model file'
      }
      title={
        failed
          ? pinned
            ? `${modelError} — the procedural robot is being used instead`
            : `${modelError} — click to switch back to the procedural robot`
          : pinned
            ? `Model is fixed by the ?model= URL parameter (${active ? 'on' : 'off'})`
            : active
              ? '3D model file: on (worker-robot.glb)'
              : '3D model file: off — using the procedural robot'
      }
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-lg transition-colors',
        pinned && 'cursor-not-allowed opacity-50',
        !pinned && 'cursor-pointer',
        failed
          ? 'bg-candy-red/15 text-candy-red hover:bg-candy-red/25'
          : active
            ? 'bg-candy-blue/20 text-[#2f7fb0] hover:bg-candy-blue/30'
            : 'text-ink-dim hover:bg-white hover:text-ink-strong',
      )}
    >
      {failed ? (
        <TriangleAlert className="h-3.5 w-3.5" strokeWidth={2.6} aria-hidden />
      ) : active ? (
        <Boxes className="h-3.5 w-3.5" strokeWidth={2.6} aria-hidden />
      ) : (
        <Box className="h-3.5 w-3.5" strokeWidth={2.6} aria-hidden />
      )}
    </button>
  );
}
