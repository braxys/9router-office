'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Coffee,
  Crosshair,
  Eye,
  Lightbulb,
  Pause,
  Play,
  RotateCcw,
  Send,
  Siren,
  Sparkles,
} from 'lucide-react';
import { useAgentStore } from '@/store/useAgentStore';
import { playClick, playConfirm, playToggle } from '@/lib/audio';
import { MANUAL_STATUSES, STATUS_META } from '@/lib/agents';
import { requestCamera } from '@/lib/cameraBus';
import { cn } from '@/lib/format';
import { ModelToggle } from './ModelToggle';
import { SoundToggle } from './SoundToggle';
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

/** HUD-level view shortcuts; the canvas owns the actual flight. */
const CAMERA_ACTIONS = [
  { preset: 'overview', label: 'Overview camera', icon: Eye },
  { preset: 'hub', label: 'Hub camera', icon: Box },
  { preset: 'focus', label: 'Focus selected robot', icon: Crosshair },
] as const;

export function ControlDock() {
  const agents = useAgentStore((s) => s.agents);
  const selectedAgentId = useAgentStore((s) => s.selectedAgentId);
  const selectAgent = useAgentStore((s) => s.selectAgent);
  const setStatus = useAgentStore((s) => s.setStatus);
  const setAllStatuses = useAgentStore((s) => s.setAllStatuses);
  const resetTelemetry = useAgentStore((s) => s.resetTelemetry);
  const simulationMode = useAgentStore((s) => s.simulationMode);
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

  // Keyboard shortcuts 1..4 map onto the manual status triggers
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      const index = Number(event.key) - 1;
      if (Number.isInteger(index) && index >= 0 && index < MANUAL_STATUSES.length) {
        event.preventDefault();
        trigger(MANUAL_STATUSES[index]);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [trigger]);

  return (
    <section
      aria-label="Simulation mode control dock"
      className="toy-card pointer-events-auto w-full overflow-hidden"
    >
      {/* header */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-card-border/70 px-4 py-3">
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
            aria-label="Camera presets"
            className="flex items-center gap-1 rounded-xl border-2 border-card-border/70 bg-card-soft/70 p-1"
          >
            {CAMERA_ACTIONS.map(({ preset, label, icon: Icon }) => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  requestCamera(preset);
                  playClick();
                }}
                aria-label={label}
                title={label}
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-ink-dim transition-colors hover:bg-white hover:text-ink-strong"
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={2.6} aria-hidden />
              </button>
            ))}
          </div>

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

      <div className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_auto]">
        {/* status triggers */}
        <div className="min-w-0">
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
                'cursor-pointer rounded-full px-2 py-0.5 text-[11px] font-bold transition-colors',
                broadcast
                  ? 'bg-candy-yellow/30 text-[#8a6a10]'
                  : 'text-ink-dim hover:bg-card-soft hover:text-ink',
              )}
            >
              {broadcast ? 'Everyone' : `Only ${selected?.name ?? '—'}`}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {MANUAL_STATUSES.map((status, index) => {
              const meta = STATUS_META[status];
              const Icon = STATUS_ICON[status];
              const isActive = !broadcast && selected?.status === status;
              const isFlashing = flash === status;
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => trigger(status)}
                  aria-label={`Set ${broadcast ? 'all robots' : selected?.name ?? 'robot'} to ${meta.label}`}
                  title={`${meta.label} — ${STATUS_HINT[status]}  (key ${index + 1})`}
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
                  <span className="flex items-center gap-1.5">
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
                    <span className="text-[11px] font-extrabold tracking-wide text-ink-strong uppercase">
                      {meta.label}
                    </span>
                    <kbd className="ml-auto rounded bg-card-soft px-1 text-[10px] font-bold text-ink-dim">
                      {index + 1}
                    </kbd>
                  </span>
                  <span className="truncate text-[10px] font-medium text-ink-dim">
                    {meta.expression}
                  </span>
                </button>
              );
            })}
          </div>

          <p className="mt-2 flex items-center gap-1.5 text-[11px] leading-relaxed font-medium text-ink-dim">
            <Sparkles className="h-3 w-3 shrink-0 text-candy-yellow" strokeWidth={2.4} aria-hidden />
            <span aria-live="polite">
              {flash
                ? `${STATUS_META[flash].label} sent to ${broadcast ? 'everyone' : selected?.name}`
                : STATUS_HINT[selected?.status ?? 'IDLE']}
            </span>
          </p>
        </div>

        {/* robot selector */}
        <div className="min-w-0 lg:w-[248px]">
          <p className="mb-2 text-[11px] font-bold tracking-wide text-ink-dim uppercase">
            Pick a robot
          </p>
          <div className="toy-scroll grid max-h-[104px] gap-1 overflow-y-auto pr-1">
            {agents.map((agent) => {
              const meta = STATUS_META[agent.status];
              const isSelected = agent.id === selectedAgentId;
              return (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => {
                    selectAgent(agent.id);
                    playClick();
                  }}
                  aria-pressed={isSelected}
                  className={cn(
                    'flex min-h-8 cursor-pointer items-center gap-2 rounded-xl border-2 px-2 py-1 text-left transition-colors',
                    isSelected
                      ? 'border-card-border bg-card-soft'
                      : 'border-transparent hover:bg-card-soft/70',
                  )}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-md"
                    style={{ backgroundColor: agent.accentColor }}
                    aria-hidden
                  />
                  <span className="truncate text-[11px] font-bold text-ink-strong">
                    {agent.name}
                  </span>
                  <span
                    className="ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-extrabold tracking-wide uppercase"
                    style={{ color: meta.color, backgroundColor: `${meta.color}1f` }}
                  >
                    {meta.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
