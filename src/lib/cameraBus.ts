/**
 * Tiny pub/sub for camera presets.
 *
 * The HUD lives outside the R3F canvas, so a DOM-level bus keeps
 * presentation-only state out of the telemetry store. The `animating` flag is
 * read by the frame limiter so a camera flight runs at the active budget
 * (~28 FPS) instead of the idle 30 FPS.
 */

export type CameraPreset = 'overview' | 'hub' | 'focus';

type Listener = (preset: CameraPreset) => void;

const listeners = new Set<Listener>();
let animating = false;

export function subscribeCamera(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function requestCamera(preset: CameraPreset): void {
  listeners.forEach((listener) => listener(preset));
}

export function setCameraAnimating(value: boolean): void {
  animating = value;
}

export function isCameraAnimating(): boolean {
  return animating;
}
