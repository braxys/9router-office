import type { AgentConfig, AgentStatus } from './types';

/**
 * Desks sit on a shallow arc across the back of the office so the camera sees
 * every robot's face and the central hub stays visible in front of them.
 */
const SLOT_POSITIONS: Array<[number, number]> = [
  [-4.4, -1.5],
  [-1.6, -3.9],
  [1.6, -3.9],
  [4.4, -1.5],
];

export interface AgentSlot {
  position: [number, number, number];
  /** Y rotation that makes the agent face the camera (+Z). */
  rotationY: number;
  /** Unit vector pointing from the hub toward the desk. */
  outward: [number, number];
}

export function getAgentSlot(index: number): AgentSlot {
  const [x, z] = SLOT_POSITIONS[index % SLOT_POSITIONS.length];
  const len = Math.hypot(x, z) || 1;
  return {
    position: [x, 0, z],
    // Every robot faces the viewer so its expressive face stays readable.
    rotationY: 0,
    outward: [x / len, z / len],
  };
}

/**
 * The four simulation agents.
 *
 * Each names an identity rather than a colour: `buildInitialAgents()` resolves
 * it into the body colour and the shell. Only `import type` appears in this
 * module — `scripts/layout-check.mjs` imports it directly through Node's type
 * stripping, so a runtime import here would break the layout gate at load time.
 */
export const AGENT_CONFIGS: AgentConfig[] = [
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    shortName: 'GEMINI',
    provider: 'Google DeepMind',
    model: 'gemini-2.5-pro',
    identity: 'gemini',
  },
  {
    id: 'claude-sonnet-4-5',
    name: 'Claude Sonnet 4.5',
    shortName: 'CLAUDE',
    provider: 'Anthropic',
    model: 'claude-sonnet-4-5',
    identity: 'anthropic',
  },
  {
    id: 'gpt-5-1',
    name: 'GPT-5.1',
    shortName: 'GPT',
    provider: 'OpenAI',
    model: 'gpt-5.1',
    identity: 'openai',
  },
  {
    id: 'llama-3-3-70b',
    name: 'Llama 3.3 70B',
    shortName: 'LLAMA',
    provider: 'Ollama · Local',
    model: 'llama3.3:70b',
    identity: 'ollama',
  },
];

export const AGENT_SLOTS: AgentSlot[] = AGENT_CONFIGS.map((_, index) =>
  getAgentSlot(index),
);

export interface StatusMeta {
  label: AgentStatus;
  color: string;
  expression: string;
  description: string;
}

export const STATUS_META: Record<AgentStatus, StatusMeta> = {
  IDLE: {
    label: 'IDLE',
    color: '#5CB8F2',
    expression: 'Chair sway',
    description: 'Relaxed sway · coffee glances · happy nodding',
  },
  THINKING: {
    label: 'THINKING',
    color: '#FFB020',
    expression: 'Lightbulb',
    description: 'Eager lean-in · super-fast typing · bouncing lightbulb',
  },
  STREAMING: {
    label: 'STREAMING',
    color: '#58D6A9',
    expression: 'Confetti mail',
    description: 'Typing + launching gift parcels to the central hub',
  },
  ERROR: {
    label: 'ERROR',
    color: '#FF6B7A',
    expression: 'X X eyes',
    description: 'Startled hop · head tilt · spinning eyes · monitor smoke',
  },
};

/** Buttons exposed in the HUD dock. */
export const MANUAL_STATUSES: AgentStatus[] = ['IDLE', 'THINKING', 'STREAMING', 'ERROR'];
