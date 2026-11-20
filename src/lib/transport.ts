/**
 * Transport (pause) rules for the 3D office.
 *
 * Kept free of Node imports, of React and of any I/O so the truth table can be
 * executed directly by `scripts/transport-rules.mjs` — the tests run this exact
 * code, not a copy of it.
 *
 * Why this module exists
 * ----------------------
 * `simulationMode` answers one question: *who owns the roster* — the live
 * 9Router feed, or the mock tick. It used to answer two, because the transport
 * button reused it as a pause flag. Pressing "Pause" therefore did not stop
 * anything: it handed the robots to the other source, which kept moving them.
 * A user reads that as "the simulation cannot be paused", and they are right.
 *
 * So the brake is now its own latch (`paused`), and the source is separate
 * (`simulationMode`). The two rules that matter:
 *
 *   - `paused` outranks the source. While it is on, BOTH the feed and the tick
 *     are no-ops, so the office is genuinely frozen.
 *   - A source change may never clear the brake. A failed poll flips
 *     `simulationMode` (the feed vanished, fall back to the mock); if that also
 *     unpaused, the office would start moving again behind the user's back,
 *     which is the second half of the same bug.
 */

/** The two independent inputs to every transport decision. */
export interface TransportState {
  /** The brake. Stops both the live feed and the mock tick. */
  paused: boolean;
  /** Which source owns the roster. Not a brake — never was. */
  simulationMode: boolean;
}

/** May a live 9Router snapshot be written to the roster right now? */
export function acceptsLive(state: TransportState): boolean {
  return !state.paused && !state.simulationMode;
}

/** May the mock telemetry tick run right now? */
export function acceptsSimulation(state: TransportState): boolean {
  return !state.paused && state.simulationMode;
}

/** True when the office is frozen, whichever source owns it. */
export function isFrozen(state: TransportState): boolean {
  return state.paused;
}

/**
 * What the one transport control should say.
 *
 * `action` is what pressing the button will do, so the button is never labelled
 * with the state it is already in. `status` is what the office is doing — the
 * pair has to agree, which is what the old UI got wrong: it printed "Paused"
 * while the live feed was actively moving the robots.
 */
export interface TransportView {
  action: 'Pause' | 'Resume';
  status: string;
}

export function transportView(state: TransportState): TransportView {
  if (state.paused) return { action: 'Resume', status: 'Paused' };
  return {
    action: 'Pause',
    status: state.simulationMode ? 'Demo telemetry' : 'Live telemetry',
  };
}
