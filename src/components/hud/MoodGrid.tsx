'use client';

import { Coffee, Lightbulb, Send, Siren, Sparkles } from 'lucide-react';
import { useAgentStore } from '@/store/useAgentStore';
import { useUiStore } from '@/store/useUiStore';
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
  const broadcast = useAgentStore((s) => s.broadcast);
  const flash = useUiStore((s) => s.flash);
  const toggleBroadcast = useAgentStore((s) => s.toggleBroadcast);
  const triggerMood = useAgentStore((s) => s.triggerMood);

  const selected = agents.find((agent) => agent.id === selectedAgentId) ?? agents[0];

  return (
    <section aria-label="Trigger a mood" className="min-w-0">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-bold tracking-wide text-ink-dim uppercase">
          Trigger a mood
        </p>
        <button
          type="button"
          onClick={() => {
            toggleBroadcast();
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
              onClick={() => {
                triggerMood(status);
                playClick();
              }}
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
                {/* The panel is 320px wide, so a compact cell has no room for
                    both the full status word and the shortcut badge. The label
                    is the primary affordance, so the badge yields. */}
                {!compact && (
                  <kbd className="ml-auto rounded bg-card-soft px-1 text-[10px] font-bold text-ink-dim">
                    {index + 1}
                  </kbd>
                )}
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
