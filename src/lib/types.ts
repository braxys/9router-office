import type { IdentityId } from './providerIdentity';

export type AgentStatus = 'IDLE' | 'THINKING' | 'STREAMING' | 'ERROR';

export interface AgentTelemetry {
  id: string;
  name: string;
  provider: string;
  accentColor: string;
  /**
   * Which bot shape this agent wears. Resolved from the provider key, carried on
   * the telemetry so no component has to match provider strings at render time.
   */
  identity: IdentityId;
  status: AgentStatus;
  tokensPerSecond: number;
  totalTokensToday: number;
  latencyMs: number;
  lastError?: string;
  updatedAt: number;
  /**
   * Where the current `status` came from, when that matters.
   *
   * `'live'` means the label is a *measurement* taken from a 9Router snapshot,
   * so it must expire on its own schedule. A manually chosen mood leaves this
   * undefined: a demo status is deliberate and must never fade.
   *
   * The distinction has to be per agent, not per roster. Pressing one mood
   * button claims the demo for a single robot while the others still carry live
   * labels, and an outage flips the whole roster to the demo while keeping the
   * last live labels on screen. Without this flag the mock tick treated those
   * measurements as demo state, refreshing `updatedAt` forever and even adding
   * tokens — which is how a finished session kept reporting `STREAMING`.
   */
  origin?: 'live';
}

export interface AgentConfig {
  id: string;
  name: string;
  shortName: string;
  provider: string;
  model: string;
  /**
   * The identity this simulation agent wears. A literal, not a resolved colour:
   * `buildInitialAgents()` turns it into `accentColor` + `identity` on the
   * telemetry. Keeping it a plain id is what lets `agents.ts` stay free of
   * runtime imports — `layout-check.mjs` imports it through Node's type
   * stripping, which cannot resolve a bundled module.
   */
  identity: IdentityId;
}
