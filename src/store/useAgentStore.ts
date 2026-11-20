'use client';

import { create } from 'zustand';
import { AGENT_CONFIGS } from '@/lib/agents';
import { resolveIdentity } from '@/lib/providerIdentity';
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
   * `broadcast` belongs to the store, not to a component: the mood grid is
   * rendered by both `SimulationPanel` (lg+) and `ControlDock` (<lg), and a
   * per-instance copy let the two disagree about who a trigger was aimed at.
   */
  broadcast: boolean;
  transitions: TransitionEntry[];
  eventCounter: number;
  selectAgent: (id: string) => void;
  setSimulationMode: (enabled: boolean) => void;
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
  tick: (now: number) => void;
  /**
   * Replace the agent roster with a live 9Router snapshot.
   * Additive: touches only `agents` and `selectedAgentId`. Simulation actions
   * (`setStatus`, `setAllStatuses`, `cycleAll`, `resetTelemetry`, `tick`) keep
   * working unchanged on whatever roster is present.
   *
   * No-op while `simulationMode` is on: a manual demo must not be overwritten
   * by the next 1.5 s poll.
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
  broadcast: false,
  transitions: [],
  eventCounter: 0,

  selectAgent: (id) => {
    if (get().agents.some((agent) => agent.id === id)) {
      set({ selectedAgentId: id });
    }
  },

  setSimulationMode: (enabled) => set({ simulationMode: enabled }),

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
          ? { ...agent, status, ...metricsForStatus(status), updatedAt: now }
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

  tick: (now) => {
    if (!get().simulationMode) return;
    set((state) => ({
      agents: state.agents.map((agent) => nextTelemetry(agent, now)),
    }));
  },

  applyLiveTelemetry: (agents) => {
    if (agents.length === 0) return;
    // Manual Simulation Mode owns the roster; a poll must never overwrite it.
    if (get().simulationMode) return;
    set((state) => {
      // Keep the user's selection when that provider is still on stage.
      const selectionStillValid = agents.some((agent) => agent.id === state.selectedAgentId);
      return {
        agents,
        selectedAgentId: selectionStillValid ? state.selectedAgentId : agents[0].id,
      };
    });
  },
}));
