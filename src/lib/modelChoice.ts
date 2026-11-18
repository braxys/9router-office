'use client';

import { useSyncExternalStore } from 'react';
import { DEFAULT_MODEL_URL, useUiStore } from '@/store/useUiStore';

/**
 * Which body the office should render.
 *
 * `?model=` wins over the stored preference so a screenshot harness or a link
 * can pin the choice without touching `localStorage`:
 *
 *   ?model=/models/worker-robot.glb   use that file
 *   ?model=on                         use the bundled generated model
 *   ?model=off                        force the procedural robot
 *   (absent)                          the stored preference, else procedural
 *
 * Kept in its own module (not inline in `Scene`) because it is the one piece of
 * the model path that can be reasoned about without WebGL.
 */

export type ModelChoice =
  | { kind: 'procedural'; pinned: boolean; warning?: string }
  | { kind: 'model'; url: string; pinned: boolean; warning?: string };

/** `/path` or `http(s)://host/path` only — never `javascript:`, `data:` or a bare path. */
export function isAllowedModelUrl(value: string): boolean {
  if (value.startsWith('/')) return !value.startsWith('//');
  return /^https?:\/\//i.test(value);
}

export interface ResolveModelChoiceOptions {
  /** Raw `?model=` value, or `null` when absent. */
  param: string | null;
  /** The stored preference (`useUiStore.useModel`). */
  preferred: boolean;
  /** Model used for `?model=on` and for the stored preference. */
  defaultUrl?: string;
}

/**
 * Pure: same inputs, same output, no side effects.
 *
 * A bad `?model=` value is reported as `warning` rather than logged here,
 * because this runs during render and render must stay free of side effects.
 * `Scene` emits the warning once from an effect.
 */
export function resolveModelChoice({
  param,
  preferred,
  defaultUrl = DEFAULT_MODEL_URL,
}: ResolveModelChoiceOptions): ModelChoice {
  if (param !== null) {
    const value = param.trim();

    if (value === '' || value === 'on' || value === '1') {
      return { kind: 'model', url: defaultUrl, pinned: true };
    }
    if (value === 'off' || value === '0') {
      return { kind: 'procedural', pinned: true };
    }
    if (isAllowedModelUrl(value)) {
      return { kind: 'model', url: value, pinned: true };
    }

    // Ignored, not fatal: warn once, then behave as if the parameter were absent.
    return {
      ...(preferred
        ? { kind: 'model' as const, url: defaultUrl }
        : { kind: 'procedural' as const }),
      pinned: false,
      warning: `[9router-office] Ignoring ?model=${value} — expected "on", "off", or a path starting with "/" or "http(s)://".`,
    };
  }

  return preferred
    ? { kind: 'model', url: defaultUrl, pinned: false }
    : { kind: 'procedural', pinned: false };
}

/* -------------------------------------------------------------------------- */
/*  Reading the URL without tripping hydration                                */
/* -------------------------------------------------------------------------- */

const subscribeNoop = () => () => {};

/**
 * The raw `?model=` parameter as an external store.
 *
 * `useSyncExternalStore` is the only hydration-safe way to read something the
 * server cannot know: the server snapshot is `null` (absent), and React swaps in
 * the real value after hydration without a mismatch warning. A `useState` +
 * `useEffect` pair would either mismatch or trip the `set-state-in-effect` rule.
 */
export function useModelParam(): string | null {
  return useSyncExternalStore(
    subscribeNoop,
    () =>
      typeof window === 'undefined'
        ? null
        : new URLSearchParams(window.location.search).get('model'),
    () => null,
  );
}

/**
 * The live choice, composed from the URL parameter and the stored preference.
 * Pure during render; safe on the server (both inputs default to "procedural").
 */
export function useModelChoice(): ModelChoice {
  const param = useModelParam();
  const preferred = useUiStore((s) => s.useModel);
  return resolveModelChoice({ param, preferred });
}
