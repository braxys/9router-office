'use client';

import { useCallback, useEffect, useState } from 'react';
import { Coffee, Lightbulb, Send, Siren, Sparkles } from 'lucide-react';
import { useAgentStore } from '@/store/useAgentStore';
import { playClick, playToggle } from '@/lib/audio';
import { MANUAL_STATUSES, STATUS_META } from '@/lib/agents';
import { cn } from '@/lib/format';
import type { AgentStatus } from '@/lib/types';

const STATUS_ICON: Record<AgentStatus, typeof Coffee> = {
  IDLE: Coffee,
  THINKING: Lightbulb,
  STREAMING: Send,
  ERROR: Siren,
};

const STATUS_HINT: Record<AgentStatus, string> = {
  IDLE: 'Relaxed chair sway, coffee glances, happy nodding',
  THINKING: 'Eager lean-in, super-fast typing, bouncing lightbulb',
  STREAMING: 'Typing + launching gift parcels to the central hub',
  ERROR: 'Startled hop, 45° head tilt, X X eyes, monitor smoke',
};

/**
 * Manual mood triggers for the simulation panel.
 *
 * `compact` is the narrow-panel layout: a 2×2 grid with no room for the
 * expression line, so that text moves into the button's `title` instead of
 * being dropped.
 */
export function MoodGrid({ compact = false }: { compact?: boolean }) {
  const agents = useAgentStore((s) => s.agents);
  const selectedAgentId = useAgentStore((s) => s.selectedAgentId);
  const setStatus = useAgentStore((s) => s.setStatus);
  const setAllStatuses = useAgentStore((s) => s.setAllStatuses);
  const setSimulationMode = useAgentStore((s) => s.setSimulationMode);

  const [broadcast, setBroadcast] = useState(false);
  const [flash, setFlash] = useState<AgentStatus | null>(null);

  const selected = agents.find((agent) => agent.id === selectedAgentId) ?? agents[0];

  const trigger = useCallback(
    (status: AgentStatus) => {
      // Manual play pauses the live feed, otherwise the next poll erases it.
      setSimulationMode(true);
      if (broadcast) {
        setAllStatuses(status, 'manual');
      } else if (selected) {
        setStatus(selected.id, status, 'manual');
      }
      setFlash(status);
      playClick();
    },
    [broadcast, selected, setAllStatuses, setSimulationMode, setStatus],
  );

  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), 480);
    return () => window.clearTimeout(timer);
  }, [flash]);

  return (
    <section aria-label="Trigger a mood" className="min-w-0">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-bold tracking-wide text-ink-dim uppercase">
          Trigger a mood
        </p>
        <button
          type="button"
          onClick={() => {
            setBroadcast((v) => !v);
            playToggle();
          }}
          aria-pressed={broadcast}
          className={cn(
            'min-w-0 cursor-pointer truncate rounded-full px-2 py-0.5 text-[11px] font-bold transition-colors',
            broadcast
              ? 'bg-candy-yellow/30 text-[#8a6a10]'
              : 'text-ink-dim hover:bg-card-soft hover:text-ink',
          )}
        >
          {broadcast ? 'Everyone' : `Only ${selected?.name ?? '—'}`}
        </button>
      </div>

      <div
        className={cn(
          'grid gap-2',
          compact ? 'grid-cols-2' : 'grid-cols-2 xl:grid-cols-4',
        )}
      >
        {MANUAL_STATUSES.map((status, index) => {
          const meta = STATUS_META[status];
          const Icon = STATUS_ICON[status];
          const isActive = !broadcast && selected?.status === status;
          const isFlashing = flash === status;
          // Compact mode has no room for the expression line, so the hint moves
          // into the title; either way the expression stays reachable.
          const hint = compact
            ? `${meta.expression} · ${STATUS_HINT[status]}`
            : STATUS_HINT[status];
          return (
            <button
              key={status}
              type="button"
              onClick={() => trigger(status)}
              aria-label={`Set ${broadcast ? 'all robots' : selected?.name ?? 'robot'} to ${meta.label}`}
              title={`${meta.label} — ${hint}  (key ${index + 1})`}
              className={cn(
                'toy-btn group relative flex min-h-14 cursor-pointer flex-col justify-center gap-0.5 overflow-hidden px-2.5 py-2 text-left',
                (isActive || isFlashing) && 'animate-toy-pop',
              )}
              style={
                isActive || isFlashing
                  ? {
                      borderColor: meta.color,
                      backgroundColor: `${meta.color}22`,
                      boxShadow: `0 3px 0 ${meta.color}55`,
                    }
                  : undefined
              }
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${meta.color}26` }}
                >
                  <Icon
                    className="h-3.5 w-3.5"
                    strokeWidth={2.6}
                    style={{ color: meta.color }}
                    aria-hidden
                  />
                </span>
                <span className="min-w-0 truncate text-[11px] font-extrabold tracking-wide text-ink-strong uppercase">
                  {meta.label}
                </span>
                <kbd className="ml-auto rounded bg-card-soft px-1 text-[10px] font-bold text-ink-dim">
                  {index + 1}
                </kbd>
              </span>
              {!compact && (
                <span className="truncate text-[10px] font-medium text-ink-dim">
                  {meta.expression}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* The pop animation is the only visual confirmation of a trigger, and it
          is suppressed by prefers-reduced-motion, so the same news is announced
          here. Compact mode keeps it audible without spending panel height. */}
      <p
        className={cn(
          'mt-2 items-center gap-1.5 text-[11px] leading-relaxed font-medium text-ink-dim',
          compact ? 'sr-only' : 'flex',
        )}
      >
        <Sparkles className="h-3 w-3 shrink-0 text-candy-yellow" strokeWidth={2.4} aria-hidden />
        <span aria-live="polite">
          {flash
            ? `${STATUS_META[flash].label} sent to ${broadcast ? 'everyone' : selected?.name}`
            : STATUS_HINT[selected?.status ?? 'IDLE']}
        </span>
      </p>
    </section>
  );
}
