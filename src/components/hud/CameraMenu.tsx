'use client';

import { Box, Crosshair, Eye } from 'lucide-react';
import { playClick } from '@/lib/audio';
import { requestCamera } from '@/lib/cameraBus';

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

/** Camera preset menu for the simulation panel: one full-width row per view. */
export function CameraMenu() {
  return (
    <section aria-label="Kamera" className="min-w-0">
      <p className="mb-2 text-[11px] font-bold tracking-wide text-ink-dim uppercase">Kamera</p>
      <div role="group" aria-label="Camera presets" className="flex flex-col gap-1.5">
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
            className="toy-btn group flex min-h-9 w-full cursor-pointer items-center gap-2 px-2.5 text-[12px] font-bold text-ink hover:bg-card-soft hover:text-ink-strong"
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
