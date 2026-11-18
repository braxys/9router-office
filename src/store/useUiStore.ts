'use client';

import { create } from 'zustand';
import type { AgentStatus } from '@/lib/types';

/**
 * Presentation-only preferences: sound and the opt-in `.glb` model.
 *
 * Deliberately NOT part of `useAgentStore`. That store is the telemetry source
 * of truth and `AGENT.md` §6 forbids putting presentation state in it — a
 * preference change must never look like a telemetry update.
 *
 * Hydration: the store always *starts* at the defaults so the server render and
 * the first client render agree, then `hydrateUiPrefs()` applies whatever is in
 * `localStorage` from an effect. Reading storage during render would produce a
 * hydration mismatch, which React logs as a console error — and the smoke gate
 * fails on console errors.
 */

export const UI_STORAGE_KEY = '9router-office:ui';

/** The generated model that ships with the repo. */
export const DEFAULT_MODEL_URL = '/models/worker-robot.glb';

export interface UiPrefs {
  /** UI click sounds. Off by default: never surprise anyone with audio. */
  soundEnabled: boolean;
  /** Use the `.glb` model instead of the procedural robot. */
  useModel: boolean;
}

interface UiStore extends UiPrefs {
  /** Set when a model failed to load, so the HUD can explain and revert. */
  modelError: string | null;
  /**
   * Status whose pop animation is currently playing, or `null`.
   *
   * Lives here rather than in `useAgentStore` because it is feedback, not
   * telemetry: the mood grid reads it to animate the button a trigger just hit.
   * Both grids are mounted (one per breakpoint), so it cannot be local state —
   * a 1..4 keypress must light up the grid that is actually on screen.
   */
  flash: AgentStatus | null;
  setFlash: (status: AgentStatus | null) => void;
  /**
   * agentId -> the exact `lastError` text the user closed.
   *
   * Keyed by the text, not a timestamp: the bubble returns by itself when the
   * message changes, and the reset hint is an absolute date rather than a
   * countdown, so the text does not drift. Session-only on purpose — a
   * dismissal from yesterday must not silence today's failure.
   */
  dismissedErrors: Record<string, string>;
  setSoundEnabled: (enabled: boolean) => void;
  setUseModel: (enabled: boolean) => void;
  setModelError: (message: string | null) => void;
  dismissError: (agentId: string, error: string) => void;
  /**
   * Forgets a dismissal once the failure clears.
   *
   * Without this, a provider whose failure text carries no reset date — live
   * codebuddy is exactly `Quota exhausted · 429 · 3/3 down` — would be silenced
   * for the rest of the session after one dismiss: the quota recovers, dies
   * again, and the byte-identical string matches the stored key, so no bubble.
   */
  clearDismissedError: (agentId: string) => void;
  /** Applies persisted values after mount. Safe to call more than once. */
  hydrate: () => void;
}

const DEFAULTS: UiPrefs = { soundEnabled: false, useModel: false };

function readPersisted(): Partial<UiPrefs> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(UI_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<UiPrefs>;
    return {
      soundEnabled: typeof parsed.soundEnabled === 'boolean' ? parsed.soundEnabled : undefined,
      useModel: typeof parsed.useModel === 'boolean' ? parsed.useModel : undefined,
    };
  } catch {
    // A corrupt entry must never break the office; fall back to the defaults.
    return {};
  }
}

function persist(prefs: UiPrefs) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(UI_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Private mode / quota: preferences simply do not survive the session.
  }
}

export const useUiStore = create<UiStore>()((set, get) => ({
  ...DEFAULTS,
  modelError: null,
  dismissedErrors: {},
  flash: null,

  setFlash: (status) => set({ flash: status }),

  setSoundEnabled: (enabled) => {
    set({ soundEnabled: enabled });
    persist({ soundEnabled: enabled, useModel: get().useModel });
  },

  setUseModel: (enabled) => {
    set({ useModel: enabled, modelError: null });
    persist({ soundEnabled: get().soundEnabled, useModel: enabled });
  },

  setModelError: (message) => set({ modelError: message }),

  dismissError: (agentId, error) =>
    set((state) => ({
      dismissedErrors: { ...state.dismissedErrors, [agentId]: error },
    })),

  clearDismissedError: (agentId) =>
    set((state) => {
      // Return the same state object when there is nothing to forget, so the
      // subscription does not notify on every healthy tick.
      if (!(agentId in state.dismissedErrors)) return state;
      const next = { ...state.dismissedErrors };
      delete next[agentId];
      return { dismissedErrors: next };
    }),

  hydrate: () => {
    const persisted = readPersisted();
    if (persisted.soundEnabled === undefined && persisted.useModel === undefined) return;
    set({
      soundEnabled: persisted.soundEnabled ?? get().soundEnabled,
      useModel: persisted.useModel ?? get().useModel,
    });
  },
}));
