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
