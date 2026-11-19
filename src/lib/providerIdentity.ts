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
 * `robotModel.ts`. The shape unions live in `robotModel.ts` because that module
 * owns the part tables; they arrive here as types and are erased at runtime.
 */
import type { EmblemId, RobotPalette, ShellId, TopperId } from './robotModel';

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

export interface ProviderIdentity {
  id: IdentityId;
  /** Display name. `null` only on `default` -> the raw provider key is used. */
  label: string | null;
  /**
   * The four brand roles from the provider's real logo.
   *
   * `{}` only on `default`: the runtime accent hashed from the key wins, which
   * is what keeps an unknown provider exactly as it looks today.
   */
  palette: RobotPalette;
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
  palette: RobotPalette;
  shell: ShellId;
  topper: TopperId;
  emblem: EmblemId;
}

/* -------------------------------------------------------------------------- */
/*  The table                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * One palette per provider, four roles each, taken from the provider's real
 * logo — not the pastel office palette. They sit on a cream floor under a warm
 * key light, so a few are a touch deeper than the logo's own value.
 *
 * Every role is declared explicitly on every row, even where two roles happen to
 * hold the same hex: "this brand has no second colour" is then a statement in
 * the data, not a side effect of the fallback chain.
 *
 * `default` is the empty palette on purpose — an unknown provider keeps the
 * colour hashed from its key, which is exactly today's look.
 */
export const IDENTITIES: Record<IdentityId, ProviderIdentity> = {
  default: {
    id: 'default',
    label: null,
    palette: {},
    shell: 'box',
    topper: 'ball',
    emblem: 'none',
    aliases: [],
  },
  codebuddy: {
    id: 'codebuddy',
    label: 'CodeBuddy',
    palette: { body: '#6C4DFF', limb: '#2EA99D', accent: '#2EA99D', extra: '#2EA99D' },
    shell: 'cat',
    topper: 'catface',
    emblem: 'catface',
    aliases: ['codebuddy', 'codebuddy-intl'],
  },
  antigravity: {
    id: 'antigravity',
    label: 'Antigravity',
    palette: { body: '#3186FF', limb: '#FC413D', accent: '#FFE432', extra: '#00B95C' },
    shell: 'arch',
    topper: 'arch',
    emblem: 'arch',
    aliases: ['antigravity'],
  },
  codex: {
    id: 'codex',
    label: 'OpenAI Codex',
    palette: { body: '#F2F2F2', limb: '#1A1A1A', accent: '#10A37F', extra: '#1A1A1A' },
    shell: 'hex',
    topper: 'knot',
    emblem: 'knot',
    aliases: ['codex', 'codex-cli', 'openai-codex'],
  },
  gemini: {
    id: 'gemini',
    label: 'Gemini',
    palette: { body: '#4285F4', limb: '#9B72CB', accent: '#D96570', extra: '#F9AB00' },
    shell: 'box',
    topper: 'sparkle',
    emblem: 'sparkle',
    aliases: ['gemini', 'gemini-2.5-pro', 'google', 'google-deepmind'],
  },
  kilocode: {
    id: 'kilocode',
    label: 'Kilo Code',
    palette: { body: '#F4ED14', limb: '#0A0A0A', accent: '#0A0A0A', extra: '#0A0A0A' },
    shell: 'pixel',
    topper: 'pixelK',
    emblem: 'pixelK',
    aliases: ['kilocode', 'kilo'],
  },
  nvidia: {
    id: 'nvidia',
    label: 'NVIDIA NIM',
    palette: { body: '#76B900', limb: '#0A0A0A', accent: '#0A0A0A', extra: '#0A0A0A' },
    shell: 'box',
    topper: 'eye',
    emblem: 'eye',
    aliases: ['nvidia', 'nvidia-nim', 'nim'],
  },
  nous: {
    id: 'nous',
    label: 'Nous Research',
    palette: { body: '#111111', limb: '#F2F2F2', accent: '#0000F2', extra: '#F2F2F2' },
    shell: 'manga',
    topper: 'nfringe',
    emblem: 'nfringe',
    aliases: ['nous', 'nous-research'],
  },
  opencode: {
    id: 'opencode',
    label: 'OpenCode',
    palette: { body: '#D2D2D2', limb: '#1F1F1F', accent: '#3B5CF6', extra: '#1F1F1F' },
    shell: 'round',
    topper: 'terminal',
    emblem: 'terminal',
    aliases: ['opencode'],
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    palette: { body: '#7624F4', limb: '#03080A', accent: '#C8FF00', extra: '#03080A' },
    shell: 'box',
    topper: 'router',
    emblem: 'router',
    aliases: ['openrouter'],
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    palette: { body: '#D97757', limb: '#191919', accent: '#191919', extra: '#191919' },
    shell: 'box',
    topper: 'burst',
    emblem: 'burst',
    aliases: ['anthropic', 'claude', 'claude-sonnet', 'claude-sonnet-4-5'],
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    palette: { body: '#10A37F', limb: '#0A0A0A', accent: '#0A0A0A', extra: '#0A0A0A' },
    shell: 'hex',
    topper: 'openai',
    emblem: 'openai',
    aliases: ['openai', 'gpt', 'gpt-5', 'gpt-5-1'],
  },
  ollama: {
    id: 'ollama',
    label: 'Ollama',
    palette: { body: '#9AA7B4', limb: '#111111', accent: '#111111', extra: '#111111' },
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
  const { palette } = identity;
  const color =
    palette.body ?? UNKNOWN_PROVIDER_COLORS[hashKey(key) % UNKNOWN_PROVIDER_COLORS.length];

  return {
    id: identity.id,
    label: identity.label ?? key,
    color,
    palette,
    shell: identity.shell,
    topper: identity.topper,
    emblem: identity.emblem,
  };
}
