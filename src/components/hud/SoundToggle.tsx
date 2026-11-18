'use client';

import { useEffect } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { playToggle } from '@/lib/audio';
import { useUiStore } from '@/store/useUiStore';
import { cn } from '@/lib/format';

/**
 * Mute/unmute for the toy UI clicks. Off by default; the preference survives a
 * reload (applied after mount, so it cannot cause a hydration mismatch).
 */
export function SoundToggle() {
  const soundEnabled = useUiStore((s) => s.soundEnabled);
  const setSoundEnabled = useUiStore((s) => s.setSoundEnabled);

  // Apply the persisted preference once, after hydration.
  useEffect(() => {
    useUiStore.getState().hydrate();
  }, []);

  return (
    <button
      type="button"
      onClick={() => {
        const next = !soundEnabled;
        setSoundEnabled(next);
        // Play *after* enabling so the user hears what they switched on.
        if (next) playToggle();
      }}
      aria-pressed={soundEnabled}
      aria-label={soundEnabled ? 'Mute interface sounds' : 'Enable interface sounds'}
      title={soundEnabled ? 'Interface sounds: on' : 'Interface sounds: off (click to enable)'}
      className={cn(
        'flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg transition-colors',
        soundEnabled
          ? 'bg-candy-mint/20 text-[#2f8f6d] hover:bg-candy-mint/30'
          : 'text-ink-dim hover:bg-white hover:text-ink-strong',
      )}
    >
      {soundEnabled ? (
        <Volume2 className="h-3.5 w-3.5" strokeWidth={2.6} aria-hidden />
      ) : (
        <VolumeX className="h-3.5 w-3.5" strokeWidth={2.6} aria-hidden />
      )}
    </button>
  );
}
