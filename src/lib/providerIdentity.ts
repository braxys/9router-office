/**
 * Who each bot is: one table mapping a provider key to its identity.
 *
 * Three consumers read this module and nothing else decides a bot's identity:
 *   1. `routerAdapter.ts`     — live 9Router rows, keyed by provider id.
 *   2. `useAgentStore.ts`     — the simulation seed, keyed by `AGENT_CONFIGS`.
 *   3. `RobotParts.tsx`       — through the `identity` on each agent's telemetry.
 *
 * The identity is data, not a render-time guess: `AgentTelemetry.identity` is an
 * `IdentityId`, so no component ever matches provider strings.
 *
 * Deliberately dependency-free (no React, no three, and `import type` only) so
 * Node can import it directly with type-stripping, the same way it imports
 * `robotModel.ts`.
 */

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Every identity the office can render.
 *
 * `default` is the body the office shipped with: no shell, the yellow antenna
 * ball, and a colour hashed from the provider key. Any provider without a table
 * entry lands there, so a provider released tomorrow still gets a bot.
 */
export type IdentityId =
  | 'default'
  | 'codebuddy'
  | 'antigravity'
  | 'codex'
  | 'gemini'
  | 'kilocode'
  | 'nvidia'
  | 'nous'
  | 'opencode'
  | 'openrouter'
  | 'anthropic'
  | 'openai'
  | 'ollama';

/**
 * The head silhouette. `box` is the plain cranium every bot has; the others add
 * blocks around it, so one neutral `.glb` stays valid for all of them.
 */
export type ShellId = 'box' | 'cat' | 'arch' | 'hex' | 'pixel' | 'round' | 'manga';

/**
 * What sits on the antenna. `ball` is the original yellow sphere and is drawn
 * by the rig itself (it pulses), not from a part table.
 */
export type TopperId =
  | 'ball'
  | 'catface'
  | 'arch'
  | 'knot'
  | 'sparkle'
  | 'pixelK'
  | 'eye'
  | 'nfringe'
  | 'terminal'
  | 'router'
  | 'burst'
  | 'openai'
  | 'llama';

/** The chest badge. Every topper doubles as one, except the ball. */
export type EmblemId = Exclude<TopperId, 'ball'> | 'none';

export interface ProviderIdentity {
  id: IdentityId;
  /** Display name. `null` only on `default` -> the raw provider key is used. */
  label: string | null;
  /** Main body colour. `null` only on `default` -> hashed from the key. */
  body: string | null;
  /** Second brand colour, used by one shell part (CodeBuddy ears, Antigravity arch). */
  accent2?: string;
  shell: ShellId;
  topper: TopperId;
  emblem: EmblemId;
  /** 9Router provider ids, simulation config ids and display names. Matched normalised. */
  aliases: readonly string[];
}

/** What the render path consumes: every field resolved, nothing nullable. */
export interface ResolvedIdentity {
  id: IdentityId;
  label: string;
  color: string;
  accent2?: string;
  shell: ShellId;
  topper: TopperId;
  emblem: EmblemId;
}

/* -------------------------------------------------------------------------- */
/*  The table                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Colours are the providers' real brand hexes, taken from 9Router's provider
 * registry — not the pastel office palette. They sit on a cream floor under a
 * warm key light, so a few are a touch deeper than the logo's own value.
 */
export const IDENTITIES: Record<IdentityId, ProviderIdentity> = {
  default: {
    id: 'default',
    label: null,
    body: null,
    shell: 'box',
    topper: 'ball',
    emblem: 'none',
    aliases: [],
  },
  codebuddy: {
    id: 'codebuddy',
    label: 'CodeBuddy',
    body: '#5B4BE8',
    accent2: '#2FD4C4',
    shell: 'cat',
    topper: 'catface',
    emblem: 'catface',
    aliases: ['codebuddy', 'codebuddy-intl', 'code-buddy'],
  },
  antigravity: {
    id: 'antigravity',
    label: 'Antigravity',
    body: '#4F9CF0',
    accent2: '#F5B73D',
    shell: 'arch',
    topper: 'arch',
    emblem: 'arch',
    aliases: ['antigravity'],
  },
  codex: {
    id: 'codex',
    label: 'OpenAI Codex',
    body: '#3B82F6',
    shell: 'hex',
    topper: 'knot',
    emblem: 'knot',
    aliases: ['codex', 'codex-cli', 'openai-codex'],
  },
  gemini: {
    id: 'gemini',
    label: 'Gemini',
    body: '#4285F4',
    shell: 'box',
    topper: 'sparkle',
    emblem: 'sparkle',
    aliases: ['gemini', 'gemini-2.5-pro', 'google', 'google-deepmind'],
  },
  kilocode: {
    id: 'kilocode',
    label: 'Kilo Code',
    body: '#FF6B35',
    shell: 'pixel',
    topper: 'pixelK',
    emblem: 'pixelK',
    aliases: ['kilocode', 'kilo-code', 'kilo'],
  },
  nvidia: {
    id: 'nvidia',
    label: 'NVIDIA NIM',
    body: '#76B900',
    shell: 'box',
    topper: 'eye',
    emblem: 'eye',
    aliases: ['nvidia', 'nvidia-nim', 'nim'],
  },
  nous: {
    id: 'nous',
    label: 'Nous Research',
    body: '#7C3AED',
    // Ink, not black: a pure #000 fringe reads as a hole punched in the head
    // next to this office's cream and pastel palette.
    accent2: '#2A2A33',
    shell: 'manga',
    topper: 'nfringe',
    emblem: 'nfringe',
    aliases: ['nous', 'nous-research', 'nousresearch'],
  },
  opencode: {
    id: 'opencode',
    label: 'OpenCode',
    body: '#E87040',
    shell: 'round',
    topper: 'terminal',
    emblem: 'terminal',
    aliases: ['opencode', 'open-code'],
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    body: '#F97316',
    shell: 'box',
    topper: 'router',
    emblem: 'router',
    aliases: ['openrouter', 'open-router'],
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    body: '#D97757',
    shell: 'box',
    topper: 'burst',
    emblem: 'burst',
    aliases: ['anthropic', 'claude', 'claude-sonnet', 'claude-sonnet-4-5'],
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    body: '#10A37F',
    shell: 'hex',
    topper: 'openai',
    emblem: 'openai',
    aliases: ['openai', 'gpt', 'gpt-5', 'gpt-5-1'],
  },
  ollama: {
    id: 'ollama',
    label: 'Ollama',
    body: '#9AA7B4',
    shell: 'box',
    topper: 'llama',
    emblem: 'llama',
    aliases: ['ollama', 'llama', 'llama-3-3-70b', 'llama3'],
  },
};

/**
 * Colours for providers with no table entry, picked by hashing the key.
 *
 * Kept from the adapter this module replaces: two foreign providers must not
 * become identical twins on stage, and the same provider must not change colour
 * between polls.
 */
export const UNKNOWN_PROVIDER_COLORS = [
  '#5CB8F2',
  '#FF9D5C',
  '#58D6A9',
  '#B98BFF',
  '#FFC94D',
  '#FF8FA3',
];

/* -------------------------------------------------------------------------- */
/*  Resolver                                                                  */
/* -------------------------------------------------------------------------- */

/** Lowercase, alphanumerics only: `claude-sonnet-4-5` and `Claude Sonnet 4.5` agree. */
function normalise(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Stable hash, identical to the one the adapter used before this module existed. */
function hashKey(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) % 100_000;
  }
  return hash;
}

/** Built once: the alias lookup never changes at runtime. */
const ALIAS_INDEX: ReadonlyMap<string, ProviderIdentity> = new Map(
  Object.values(IDENTITIES).flatMap((identity) =>
    identity.aliases.map((alias) => [normalise(alias), identity] as const),
  ),
);

/**
 * Resolve a provider key to its identity. Always returns an object: an unknown
 * key gets the default body with a colour hashed from the key itself.
 */
export function resolveIdentity(key: string): ResolvedIdentity {
  const identity = ALIAS_INDEX.get(normalise(key)) ?? IDENTITIES.default;
  const color =
    identity.body ?? UNKNOWN_PROVIDER_COLORS[hashKey(key) % UNKNOWN_PROVIDER_COLORS.length];

  return {
    id: identity.id,
    label: identity.label ?? key,
    color,
    ...(identity.accent2 === undefined ? {} : { accent2: identity.accent2 }),
    shell: identity.shell,
    topper: identity.topper,
    emblem: identity.emblem,
  };
}
