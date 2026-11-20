'use client';

import { create } from 'zustand';
import { AGENT_CONFIGS } from '@/lib/agents';
import { resolveIdentity } from '@/lib/providerIdentity';
import { decayStatus } from '@/lib/statusResolution';
import { acceptsLive, acceptsSimulation } from '@/lib/transport';
import { useUiStore } from '@/store/useUiStore';
import type { AgentStatus, AgentTelemetry } from '@/lib/types';

export interface TransitionEntry {
  id: string;
  agentId: string;
  agentName: string;
  from: AgentStatus;
  to: AgentStatus;
  at: number;
  source: 'manual' | 'auto' | 'system';
}

interface AgentStore {
  agents: AgentTelemetry[];
  selectedAgentId: string;
  simulationMode: boolean;
  /**
   * The transport brake, independent of `simulationMode`.
   *
   * `simulationMode` picks which source owns the roster; this stops both. It was
   * a mistake to reuse one boolean for both jobs: "Pause" then swapped sources
   * instead of stopping anything, so the office kept moving and the button read
   * as broken. A source change must never clear this — a failed poll flips
   * `simulationMode` to fall back to the mock, and unpausing there would restart
   * the office behind the user's back.
   */
  paused: boolean;
  /**
   * `broadcast` belongs to the store, not to a component: the mood grid is
   * rendered by both `SimulationPanel` (lg+) and `ControlDock` (<lg), and a
   * per-instance copy let the two disagree about who a trigger was aimed at.
   */
  broadcast: boolean;
  transitions: TransitionEntry[];
  eventCounter: number;
  selectAgent: (id: string) => void;
  setSimulationMode: (enabled: boolean) => void;
  setPaused: (paused: boolean) => void;
  toggleBroadcast: () => void;
  /**
   * The single mood-trigger path: the grid buttons and the 1..4 keyboard
   * shortcuts both call it, so the status write and the visual feedback cannot
   * land on different components.
   */
  triggerMood: (status: AgentStatus) => void;
  setStatus: (
    agentId: string,
    status: AgentStatus,
    source?: TransitionEntry['source'],
  ) => void;
  setAllStatuses: (status: AgentStatus, source?: TransitionEntry['source']) => void;
  cycleAll: () => void;
  resetTelemetry: () => void;
  /**
   * Drop every `lastError` without touching status or anything else.
   *
   * Used when the live feed disappears: the roster is kept so the office does
   * not go blank, but the failure text came from a database we can no longer
   * read, so a bubble left on screen would be a claim about a provider nobody
   * is currently observing.
   */
  clearErrors: () => void;
  /**
   * Advance the roster clock.
   *
   * One entry point for both sources, because both need the same brake:
   *   - simulation owns the roster -> drift the mock metrics (`nextTelemetry`)
   *   - the live feed owns it      -> age each label against its `updatedAt`,
   *     so a STREAMING label can never outlive the request it describes even if
   *     the next poll never arrives
   *
   * No-op while `paused`: that is what makes the transport button a real brake.
   *
   * Takes no clock argument on purpose. It used to receive the render loop's
   * `performance.now()`, while `updatedAt` is stamped with `Date.now()` — two
   * different origins, so every age came out negative and the decay never ran.
   * Reading the clock here keeps both sides in the same domain.
   */
  tick: () => void;
  /**
   * Replace the agent roster with a live 9Router snapshot.
   * Additive: touches only `agents` and `selectedAgentId`. Simulation actions
   * (`setStatus`, `setAllStatuses`, `cycleAll`, `resetTelemetry`, `tick`) keep
   * working unchanged on whatever roster is present.
   *
   * No-op while `simulationMode` is on (a manual demo must not be overwritten by
   * the next 1.5 s poll) and no-op while `paused` (a frozen office stays frozen).
   */
  applyLiveTelemetry: (agents: AgentTelemetry[]) => void;
}

const STATUS_SEED: Record<string, AgentStatus> = {
  'gemini-2.5-pro': 'STREAMING',
  'claude-sonnet-4-5': 'THINKING',
  'gpt-5-1': 'IDLE',
  'llama-3-3-70b': 'IDLE',
};

const SEED_METRICS: Record<
  AgentStatus,
  { tokensPerSecond: number; latencyMs: number; totalTokensToday: number }
> = {
  IDLE: { tokensPerSecond: 0, latencyMs: 240, totalTokensToday: 184_320 },
  THINKING: { tokensPerSecond: 0, latencyMs: 680, totalTokensToday: 96_540 },
  STREAMING: { tokensPerSecond: 96.4, latencyMs: 318, totalTokensToday: 512_870 },
  ERROR: { tokensPerSecond: 0, latencyMs: 0, totalTokensToday: 8_240 },
};

function buildInitialAgents(): AgentTelemetry[] {
  const now = Date.now();
  return AGENT_CONFIGS.map((config) => {
    const status = STATUS_SEED[config.id] ?? 'IDLE';
    const metrics = SEED_METRICS[status];
    // The config names an identity; the colour and shape come from one place, so
    // the body, the mug and the selection ring can never disagree.
    const identity = resolveIdentity(config.identity);
    return {
      id: config.id,
      name: config.name,
      provider: config.provider,
      accentColor: identity.color,
      identity: identity.id,
      status,
      tokensPerSecond: metrics.tokensPerSecond,
      totalTokensToday: metrics.totalTokensToday,
      latencyMs: metrics.latencyMs,
      updatedAt: now,
    };
  });
}

function jitter(base: number, spread: number): number {
  return Math.max(0, base + (Math.random() - 0.5) * spread);
}

function nextTelemetry(agent: AgentTelemetry, now: number): AgentTelemetry {
  const drift = (value: number, target: number, rate: number) =>
    value + (target - value) * rate + (Math.random() - 0.5) * 2;

  switch (agent.status) {
    case 'STREAMING': {
      const tps = Math.max(8, jitter(agent.tokensPerSecond || 88, 26));
      return {
        ...agent,
        tokensPerSecond: tps,
        latencyMs: jitter(agent.latencyMs || 320, 70),
        totalTokensToday: agent.totalTokensToday + tps,
        // A stale failure must not outlive the feed it came from: when 9Router
        // disappears the bridge keeps this roster, so an old bubble would
        // otherwise sit on a robot that is no longer reporting anything real.
        lastError: undefined,
        updatedAt: now,
      };
    }
    case 'THINKING':
      return {
        ...agent,
        tokensPerSecond: 0,
        latencyMs: Math.min(1_800, Math.max(260, jitter(agent.latencyMs || 520, 180))),
        lastError: undefined,
        updatedAt: now,
      };
    case 'ERROR':
      return {
        ...agent,
        tokensPerSecond: 0,
        latencyMs: 0,
        updatedAt: now,
      };
    default:
      return {
        ...agent,
        tokensPerSecond: 0,
        latencyMs: drift(agent.latencyMs || 240, 240, 0.2),
        lastError: undefined,
        updatedAt: now,
      };
  }
}

function metricsForStatus(status: AgentStatus): Pick<
  AgentTelemetry,
  'tokensPerSecond' | 'latencyMs' | 'lastError'
> {
  switch (status) {
    case 'STREAMING':
      return { tokensPerSecond: 84 + Math.random() * 60, latencyMs: 260 + Math.random() * 120, lastError: undefined };
    case 'THINKING':
      return { tokensPerSecond: 0, latencyMs: 420 + Math.random() * 380, lastError: undefined };
    case 'ERROR': {
      // One clock read, so the displayed second and the millisecond suffix
      // cannot disagree at a second boundary.
      const at = new Date();
      return {
        tokensPerSecond: 0,
        latencyMs: 0,
        // The stamp is what lets a dismissed bubble come back when ERROR is
        // triggered again: simulation always reuses the same sentence, so a
        // plain string would silence that agent for the rest of the session.
        // It is a UTC clock time because a human reads this text in the bubble,
        // and the millisecond remainder keeps two triggers inside the same
        // second from producing identical strings.
        //
        // The `Demo ·` prefix matters: this text is applied to whatever live
        // provider happens to be selected, so without it the office would show
        // "Quota exhausted · 429" for a provider with every account healthy —
        // indistinguishable from a real failure.
        lastError: `Demo · Quota exhausted · 429 · ${at.toISOString().slice(11, 19)}.${String(
          at.getUTCMilliseconds(),
        ).padStart(3, '0')} UTC`,
      };
    }
    default:
      return { tokensPerSecond: 0, latencyMs: 180 + Math.random() * 120, lastError: undefined };
  }
}

/**
 * The flash timeout lives outside the stores so a rapid second trigger cannot be
 * cleared early by the first trigger's pending timer.
 */
let flashTimer: ReturnType<typeof setTimeout> | undefined;

export const useAgentStore = create<AgentStore>()((set, get) => ({
  agents: buildInitialAgents(),
  selectedAgentId: AGENT_CONFIGS[0].id,
  simulationMode: true,
  paused: false,
  broadcast: false,
  transitions: [],
  eventCounter: 0,

  selectAgent: (id) => {
    if (get().agents.some((agent) => agent.id === id)) {
      set({ selectedAgentId: id });
    }
  },

  setSimulationMode: (enabled) => {
    // Deliberately does not touch `paused`: a failed poll flips this to fall
    // back to the mock, and clearing the brake there would restart the office
    // while the user believes it is frozen.
    set({ simulationMode: enabled });
  },

  setPaused: (paused) => set({ paused }),

  toggleBroadcast: () => set((state) => ({ broadcast: !state.broadcast })),

  triggerMood: (status) => {
    const { agents, broadcast, selectedAgentId, setAllStatuses, setSimulationMode, setStatus } =
      get();
    // Manual play pauses the live feed, otherwise the next poll erases it.
    setSimulationMode(true);
    if (broadcast) {
      setAllStatuses(status, 'manual');
    } else {
      const selected = agents.find((agent) => agent.id === selectedAgentId) ?? agents[0];
      if (selected) setStatus(selected.id, status, 'manual');
    }

    // Feedback is presentation, so it belongs to the UI store; the timer is
    // module-scoped so a rapid second trigger restarts it instead of letting the
    // first one clear the new flash.
    useUiStore.getState().setFlash(status);
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      flashTimer = undefined;
      useUiStore.getState().setFlash(null);
    }, 480);
  },

  setStatus: (agentId, status, source = 'manual') => {
    const state = get();
    const target = state.agents.find((agent) => agent.id === agentId);
    if (!target) return;

    // Re-triggering ERROR must re-stamp even when the robot is already in it:
    // the dismissal key is the error *text*, and simulation reuses one
    // sentence, so a no-op here would leave a dismissed bubble permanently
    // closed. Every other status is idempotent and returns early as before.
    if (target.status === status && status !== 'ERROR') return;

    const now = Date.now();
    const counter = state.eventCounter + 1;
    const entry: TransitionEntry = {
      id: `evt-${counter}`,
      agentId,
      agentName: target.name,
      from: target.status,
      to: status,
      at: now,
      source,
    };

    set({
      eventCounter: counter,
      agents: state.agents.map((agent) =>
        agent.id === agentId
          ? {
              ...agent,
              status,
              ...metricsForStatus(status),
              updatedAt: now,
              // A manual mood replaces the measurement, so the label becomes
              // deliberate and stops expiring. Clearing this is what lets the
              // demo keep a chosen STREAMING indefinitely.
              origin: undefined,
            }
          : agent,
      ),
      transitions: [entry, ...state.transitions].slice(0, 24),
    });
  },

  setAllStatuses: (status, source = 'manual') => {
    get().agents.forEach((agent) => get().setStatus(agent.id, status, source));
  },

  cycleAll: () => {
    const order: AgentStatus[] = ['IDLE', 'THINKING', 'STREAMING', 'ERROR'];
    get().agents.forEach((agent) => {
      const next = order[(order.indexOf(agent.status) + 1) % order.length];
      get().setStatus(agent.id, next, 'manual');
    });
  },

  resetTelemetry: () =>
    set({ agents: buildInitialAgents(), transitions: [], eventCounter: 0 }),

  clearErrors: () =>
    set((state) => {
      // No-op (same object) when nothing is failing, so this never notifies.
      if (!state.agents.some((agent) => agent.lastError !== undefined)) return state;
      return {
        agents: state.agents.map((agent) =>
          agent.lastError === undefined ? agent : { ...agent, lastError: undefined },
        ),
      };
    }),

  tick: () => {
    const state = get();
    if (!acceptsSimulation(state) && !acceptsLive(state)) return;

    // One epoch read for both branches: `updatedAt` is stamped with `Date.now()`
    // everywhere (here and in `routerAdapter`), so a caller-supplied clock from a
    // different origin would silently disable the decay below.
    const now = Date.now();
    // The demo drifts only the robots it actually owns (see `origin`).
    const drifting = acceptsSimulation(state);

    let changed = false;
    const next = state.agents.map((agent) => {
      // A live label is a measurement, so it expires on its own schedule no
      // matter who owns the roster now. This has to come first: an outage flips
      // the roster to the demo while keeping the last live labels on screen, and
      // a mood click claims the demo for one robot while the rest still carry
      // live ones. Drifting those refreshed `updatedAt` forever, so a finished
      // session kept reporting STREAMING and kept earning tokens.
      if (agent.origin === 'live') {
        const aged = decayStatus(agent.status, Math.max(0, now - agent.updatedAt));
        if (aged === agent.status) return agent;
        changed = true;
        // `updatedAt` is deliberately left alone: re-stamping it would restart
        // the clock and hand the label another full window on every tick.
        return { ...agent, status: aged, ...metricsForStatus(aged) };
      }

      if (!drifting) return agent;
      changed = true;
      return nextTelemetry(agent, now);
    });

    // Same object when nothing moved, so this never notifies for no reason.
    if (changed) set({ agents: next });
  },

  applyLiveTelemetry: (agents) => {
    if (agents.length === 0) return;
    // A manual demo or a paused office owns the roster; a poll must never
    // overwrite either one.
    if (!acceptsLive(get())) return;
    set((state) => {
      // Keep the user's selection when that provider is still on stage.
      const selectionStillValid = agents.some((agent) => agent.id === state.selectedAgentId);
      return {
        // Stamped here because this is the boundary that defines a live
        // measurement: whatever enters through this action came from the feed and
        // must expire on its own schedule. Stamping in the adapter instead would
        // leave any other producer of a snapshot unmarked.
        agents: agents.map((agent) =>
          agent.origin === 'live' ? agent : { ...agent, origin: 'live' as const },
        ),
        selectedAgentId: selectionStillValid ? state.selectedAgentId : agents[0].id,
      };
    });
  },
}));
