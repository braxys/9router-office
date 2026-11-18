export type AgentStatus = 'IDLE' | 'THINKING' | 'STREAMING' | 'ERROR';

export interface AgentTelemetry {
  id: string;
  name: string;
  provider: string;
  accentColor: string;
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
  accentColor: string;
}

export interface AgentTransition {
  agentId: string;
  status: AgentStatus;
  source: 'manual' | 'auto' | 'system';
}
