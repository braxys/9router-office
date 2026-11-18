/**
 * Deterministic LCG. Used for decorative geometry (screen texture noise, mote
 * placement) so React renders stay pure and identical between re-renders.
 */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
