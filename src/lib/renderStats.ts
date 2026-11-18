/**
 * Frame counter shared between the R3F canvas and the HUD.
 *
 * The canvas bumps this on every rendered frame. The HUD samples it on a timer
 * so the displayed FPS reflects real draws (the dynamic throttle can hold it at
 * 30) rather than the browser's unthrottled rAF rate.
 *
 * A plain module-level counter keeps React out of the per-frame path.
 */
let frames = 0;

/** Called from `useFrame` — once per rendered frame. */
export function markFrame(): void {
  frames += 1;
}

export function readFrameCount(): number {
  return frames;
}
