'use client';

import { Box, Crosshair, Eye } from 'lucide-react';
import { playClick } from '@/lib/audio';
import { requestCamera } from '@/lib/cameraBus';
import { cn } from '@/lib/format';

/**
 * HUD-level view shortcuts; the canvas owns the actual flight.
 *
 * `label` is the visible text, `name` the fuller accessible name — every `name`
 * starts with its `label` so voice control can still say what is on screen.
 */
const CAMERA_ACTIONS = [
  { preset: 'overview', label: 'Overview', name: 'Overview camera', icon: Eye },
  { preset: 'hub', label: 'Hub', name: 'Hub camera', icon: Box },
  { preset: 'focus', label: 'Fokus robot', name: 'Fokus robot camera', icon: Crosshair },
] as const;

/**
 * Camera preset menu: one full-width row per view in the side panel, or a
 * single wrapping row of icon+label buttons when `compact`.
 *
 * `compact` exists for the `< lg` dock, which is an absolutely positioned
 * bottom layer: a stacked list there grew the dock past the free vertical space
 * on phones and painted over the top HUD. The buttons size to their content
 * rather than splitting the row into equal thirds, because "Fokus robot" plus
 * its icon does not fit a third of a 320px-wide dock.
 */
export function CameraMenu({ compact = false }: { compact?: boolean }) {
  return (
    <section aria-label="Kamera" className="min-w-0">
      <p
        className={cn(
          'text-[11px] font-bold tracking-wide text-ink-dim uppercase',
          compact ? 'mb-1.5' : 'mb-2',
        )}
      >
        Kamera
      </p>
      <div
        role="group"
        aria-label="Camera presets"
        className={cn('flex', compact ? 'flex-wrap gap-1' : 'flex-col gap-1.5')}
      >
        {CAMERA_ACTIONS.map(({ preset, label, name, icon: Icon }) => (
          <button
            key={preset}
            type="button"
            onClick={() => {
              requestCamera(preset);
              playClick();
            }}
            aria-label={name}
            title={name}
            className={cn(
              'toy-btn group flex cursor-pointer items-center font-bold text-ink hover:bg-card-soft hover:text-ink-strong',
              compact
                ? 'min-h-8 flex-auto justify-center gap-1 px-1.5 text-[11px]'
                : 'min-h-9 w-full gap-2 px-2.5 text-[12px]',
            )}
          >
            <Icon
              className="h-3.5 w-3.5 shrink-0 text-ink-dim transition-colors group-hover:text-ink-strong"
              strokeWidth={2.6}
              aria-hidden
            />
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}
