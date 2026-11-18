'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Activity, Coffee, Gauge, Monitor, Wifi, WifiOff } from 'lucide-react';
import { useAgentStore } from '@/store/useAgentStore';
import { STATUS_META } from '@/lib/agents';
import { readFrameCount } from '@/lib/renderStats';
import {
  cn,
  formatClock,
  formatCompact,
  formatLatency,
  formatTps,
} from '@/lib/format';
import type { AgentStatus } from '@/lib/types';

/**
 * FPS of the 3D canvas, sampled from the shared render counter.
 *
 * Sampling on a timer instead of every frame keeps React out of the render
 * loop, and reading the canvas counter (not rAF) makes the dynamic throttle
 * visible: all-idle sits at 30, an active office at ~28.
 */
function useFrameRate() {
  const [fps, setFps] = useState(0);
  useEffect(() => {
    let lastCount = readFrameCount();
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      const count = readFrameCount();
      const elapsed = now - last;
      if (elapsed > 0) {
        setFps(Math.round(((count - lastCount) * 1000) / elapsed));
      }
      lastCount = count;
      last = now;
    }, 500);
    return () => clearInterval(timer);
  }, []);
  return fps;
}

/* --- UTC clock as an external store (no setState-in-effect) --- */

const clockStore = {
  listeners: new Set<() => void>(),
  timer: 0 as number | undefined,
  subscribe(listener: () => void) {
    clockStore.listeners.add(listener);
    if (clockStore.listeners.size === 1) {
      clockStore.timer = window.setInterval(() => {
        clockStore.listeners.forEach((fn) => fn());
      }, 1000);
    }
    return () => {
      clockStore.listeners.delete(listener);
      if (clockStore.listeners.size === 0) {
        window.clearInterval(clockStore.timer);
        clockStore.timer = undefined;
      }
    };
  },
  getSnapshot() {
    return Math.floor(Date.now() / 1000);
  },
  getServerSnapshot() {
    return 0;
  },
};

function useClockSeconds() {
  return useSyncExternalStore(
    clockStore.subscribe,
    clockStore.getSnapshot,
    clockStore.getServerSnapshot,
  );
}

function StatusPill({ status }: { status: AgentStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold tracking-wide uppercase"
      style={{ color: meta.color, backgroundColor: `${meta.color}22` }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: meta.color }}
        aria-hidden
      />
      {meta.label}
    </span>
  );
}

/**
 * Bottom-left telemetry card.
 *
 * Rendered by `CommandCenter` inside the scene column's bottom strip. The dock
 * (`< lg` only) shares that strip, so the browser lays the two out together:
 * the dock's height changes with the viewport (it wraps), so a hard-coded
 * offset could not keep them apart at every width.
 */
export function RobotSpotlightCard() {
  const agents = useAgentStore((s) => s.agents);
  const selectedAgentId = useAgentStore((s) => s.selectedAgentId);
  const selected = agents.find((agent) => agent.id === selectedAgentId) ?? agents[0];

  return (
    <div className="toy-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[10px] font-extrabold tracking-wide text-ink-dim uppercase">
          Robot spotlight
        </p>
        <Coffee className="h-3.5 w-3.5 text-candy-orange" strokeWidth={2.4} aria-hidden />
      </div>

      <div className="mb-2 flex items-center gap-2">
        <span
          className="h-9 w-9 shrink-0 rounded-xl"
          style={{ backgroundColor: `${selected.accentColor}2e` }}
          aria-hidden
        >
          <span
            className="m-2 block h-5 w-5 rounded-md"
            style={{ backgroundColor: selected.accentColor }}
          />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-extrabold text-ink-strong">
            {selected.name}
          </p>
          <p className="truncate text-[10px] font-semibold text-ink-dim">
            {selected.provider}
          </p>
        </div>
        <StatusPill status={selected.status} />
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 border-t-2 border-card-border/60 pt-2">
        <div>
          <dt className="text-[10px] font-bold text-ink-dim uppercase">Tokens/sec</dt>
          <dd className="text-[14px] font-extrabold tabular-nums text-ink-strong">
            {formatTps(selected.tokensPerSecond)}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-bold text-ink-dim uppercase">Latency</dt>
          <dd className="text-[14px] font-extrabold tabular-nums text-ink-strong">
            {formatLatency(selected.latencyMs)}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-[10px] font-bold text-ink-dim uppercase">Tokens today</dt>
          <dd className="text-[14px] font-extrabold tabular-nums text-ink-strong">
            {formatCompact(selected.totalTokensToday)}
          </dd>
        </div>
      </dl>

      {/* effort meter */}
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-card-soft" aria-hidden>
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${Math.min(100, (selected.tokensPerSecond / 160) * 100)}%`,
            backgroundColor: STATUS_META[selected.status].color,
          }}
        />
      </div>

      {selected.lastError && (
        <p className="mt-2 truncate rounded-lg bg-candy-red/12 px-2 py-1 text-[10px] font-bold text-candy-red">
          {selected.lastError}
        </p>
      )}
    </div>
  );
}

/** Mood-change log; lives in the `SimulationPanel` (`lg` and up). */
export function MoodLogCard() {
  const transitions = useAgentStore((s) => s.transitions);

  return (
    <div className="toy-card p-3">
      <p className="mb-2 text-[10px] font-extrabold tracking-wide text-ink-dim uppercase">
        Mood changes
      </p>
      {transitions.length === 0 ? (
        <p className="text-[11px] font-semibold text-ink-dim/80">
          Everyone is behaving… for now
        </p>
      ) : (
        <ul className="toy-scroll max-h-[108px] space-y-1 overflow-y-auto pr-1">
          {transitions.slice(0, 8).map((event) => {
            const meta = STATUS_META[event.to];
            return (
              <li key={event.id} className="flex items-center gap-1.5 text-[10px] font-semibold">
                <span
                  className="h-2 w-2 shrink-0 rounded-sm"
                  style={{ backgroundColor: meta.color }}
                  aria-hidden
                />
                <span className="truncate text-ink">{event.agentName}</span>
                <span className="ml-auto shrink-0 text-ink-dim/70">
                  {event.from.slice(0, 3)}→
                </span>
                <span className="shrink-0 font-extrabold" style={{ color: meta.color }}>
                  {event.to}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function TacticalOverlay() {
  const agents = useAgentStore((s) => s.agents);
  const simulationMode = useAgentStore((s) => s.simulationMode);

  const fps = useFrameRate();
  const clockSeconds = useClockSeconds();

  const totalTps = agents.reduce((sum, agent) => sum + agent.tokensPerSecond, 0);
  const totalTokens = agents.reduce((sum, agent) => sum + agent.totalTokensToday, 0);
  const activeCount = agents.filter(
    (agent) => agent.status !== 'IDLE' && agent.status !== 'ERROR',
  ).length;
  const errorCount = agents.filter((agent) => agent.status === 'ERROR').length;

  return (
    <>
      {/* ---------------- top-left: identity ---------------- */}
      <div className="pointer-events-none absolute top-4 left-4 z-20 max-w-[min(90vw,340px)] sm:top-5 sm:left-5">
        <div className="toy-card flex items-start gap-3 px-3 py-2.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-candy-blue/20">
            <Monitor className="h-5 w-5 text-candy-blue" strokeWidth={2.4} aria-hidden />
          </div>
          <div>
            <h1 className="text-[15px] leading-none font-extrabold tracking-tight text-ink-strong">
              9Router Office
            </h1>
            <p className="mt-1 text-[11px] leading-none font-semibold text-ink-dim">
              Where your AI models come to work
            </p>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-bold tracking-wide text-ink-dim uppercase">
              <span className="inline-flex items-center gap-1">
                {simulationMode ? (
                  <WifiOff className="h-3 w-3 text-candy-orange" strokeWidth={2.8} aria-hidden />
                ) : (
                  <Wifi className="h-3 w-3 text-candy-mint" strokeWidth={2.8} aria-hidden />
                )}
                {simulationMode ? 'Sim feed' : 'Live feed'}
              </span>
              <span aria-hidden className="text-card-border">
                ·
              </span>
              <span>{clockSeconds ? formatClock(new Date(clockSeconds * 1000)) : '--:--:-- UTC'}</span>
            </p>
          </div>
        </div>
      </div>

      {/* ---------------- top-right: office vitals ---------------- */}
      <div className="pointer-events-none absolute top-4 right-4 z-20 sm:top-5 sm:right-5">
        <div className="toy-card px-3 py-2.5">
          <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-extrabold tracking-wide text-ink-dim uppercase">
            <Gauge className="h-3 w-3" strokeWidth={2.6} aria-hidden />
            Office vitals
          </p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-[10px] font-bold text-ink-dim uppercase">TPS</dt>
              <dd className="text-[13px] font-extrabold tabular-nums text-[#2f8f6d]">
                {totalTps.toFixed(1)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-[10px] font-bold text-ink-dim uppercase">Tokens</dt>
              <dd className="text-[13px] font-extrabold tabular-nums text-ink-strong">
                {formatCompact(totalTokens)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-[10px] font-bold text-ink-dim uppercase">Working</dt>
              <dd className="text-[13px] font-extrabold tabular-nums text-candy-blue">
                {activeCount}/{agents.length}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-[10px] font-bold text-ink-dim uppercase">FPS</dt>
              <dd
                className={cn(
                  'text-[13px] font-extrabold tabular-nums',
                  fps >= 22
                    ? 'text-[#2f8f6d]'
                    : fps >= 8
                      ? 'text-[#b07d10]'
                      : 'text-candy-red',
                )}
              >
                {fps || '—'}
              </dd>
            </div>
          </dl>
          {errorCount > 0 && (
            <p className="mt-1.5 flex items-center gap-1 border-t-2 border-card-border/60 pt-1.5 text-[10px] font-extrabold tracking-wide text-candy-red uppercase">
              <Activity className="h-3 w-3" strokeWidth={2.6} aria-hidden />
              {errorCount} robot{errorCount > 1 ? 's' : ''} having a bad day
            </p>
          )}
        </div>
      </div>
    </>
  );
}
