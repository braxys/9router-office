'use client';

import { useEffect } from 'react';
import { useAgentStore } from '@/store/useAgentStore';
import { playClick } from '@/lib/audio';
import { MANUAL_STATUSES } from '@/lib/agents';

/**
 * Keyboard shortcuts 1..4 map onto the manual mood triggers.
 *
 * Mounted exactly once, from `CommandCenter`: the panel (lg+) and the dock
 * (<lg) both render a `MoodGrid`, and a per-component listener would fire the
 * trigger of whichever copy happened to mount, not the one on screen. Reading
 * `triggerMood` from the store keeps the keypress on the same path as a click.
 */
export function useMoodShortcuts(): void {
  const triggerMood = useAgentStore((s) => s.triggerMood);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      const index = Number(event.key) - 1;
      if (Number.isInteger(index) && index >= 0 && index < MANUAL_STATUSES.length) {
        event.preventDefault();
        triggerMood(MANUAL_STATUSES[index]);
        playClick();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [triggerMood]);
}
