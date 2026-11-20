'use client';

import { useUiStore } from '@/store/useUiStore';

/**
 * Toy UI sounds, synthesised — no audio files, matching the project's
 * "everything is procedural and local" rule.
 *
 * Rules this module enforces:
 *  - **Muted by default.** Every voice returns immediately unless the user
 *    turned sound on, so no `AudioContext` is ever created for someone who never
 *    asked for audio (that also means no browser autoplay warning).
 *  - **Gesture-gated.** The context is created on the first call, which only
 *    ever happens from a click or key handler.
 *  - **Cheap.** Voices are one oscillator plus one gain envelope, disconnected
 *    on `ended`, so nothing accumulates.
 *  - **Respectful.** Honours `prefers-reduced-motion`, which is the closest
 *    signal the platform offers for "keep the extra sensory stuff down".
 */

const MASTER_GAIN = 0.06;

let context: AudioContext | null = null;
let master: GainNode | null = null;
let unavailable = false;

function audioEnabled(): boolean {
  if (unavailable) return false;
  if (!useUiStore.getState().soundEnabled) return false;
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  return true;
}

function getContext(): AudioContext | null {
  if (context) return context;
  if (typeof window === 'undefined') return null;

  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) {
    unavailable = true;
    return null;
  }

  try {
    context = new Ctor();
    master = context.createGain();
    master.gain.value = MASTER_GAIN;
    master.connect(context.destination);
  } catch {
    // No audio device, blocked context, or a headless browser without audio.
    unavailable = true;
    return null;
  }

  return context;
}

/**
 * Plays one short blip.
 *
 * @param frequency  Start frequency in Hz.
 * @param endFrequency Frequency to glide to, or `null` for a steady tone.
 * @param duration   Seconds.
 * @param type       Oscillator waveform.
 * @param delay      Seconds to wait before starting (for arpeggios).
 */
function voice(
  frequency: number,
  endFrequency: number | null,
  duration: number,
  type: OscillatorType,
  delay = 0,
) {
  if (!audioEnabled()) return;
  const ctx = getContext();
  if (!ctx || !master) return;

  // A context created before any interaction starts suspended; resume is a
  // no-op when it is already running.
  if (ctx.state === 'suspended') void ctx.resume();

  const start = ctx.currentTime + delay;
  const oscillator = ctx.createOscillator();
  const envelope = ctx.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  if (endFrequency !== null) {
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
  }

  // Quick attack, exponential decay: reads as a toy click, not a beep.
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(1, start + 0.008);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  oscillator.connect(envelope);
  envelope.connect(master);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);

  oscillator.onended = () => {
    oscillator.disconnect();
    envelope.disconnect();
  };
}

/** A short, dry click. Used for status triggers, robot picks, camera presets. */
export function playClick() {
  voice(660, 560, 0.05, 'square');
}

/** A two-note blip. Used for toggles (broadcast, mute, model). */
export function playToggle() {
  voice(520, null, 0.06, 'triangle');
  voice(780, null, 0.07, 'triangle', 0.055);
}

/** A rising three-note arpeggio. Used only for Reset. */
export function playConfirm() {
  voice(523, null, 0.08, 'triangle');
  voice(659, null, 0.08, 'triangle', 0.07);
  voice(784, null, 0.12, 'triangle', 0.14);
}
