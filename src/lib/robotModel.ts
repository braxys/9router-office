/**
 * The robot's body as data — the single source of truth for its shape.
 *
 * Two consumers read this module and nothing else describes the robot's blocks:
 *   1. `RobotParts.tsx`  — renders the blocks for the on-screen procedural robot.
 *   2. `scripts/build-robot-model.mjs` — builds the same blocks into a `.glb`.
 *
 * Because both read the same numbers, a shape tweak is a one-line edit here and
 * the screen and the model file can never drift apart.
 *
 * Deliberately dependency-free (no React, no three, no imports at all) so Node
 * can import it directly with type-stripping.
 *
 * Units are metres, in the robot's root space. Root origin sits on the chair
 * seat, which `WorkDesk.DESK_SEAT` owns.
 */

/* -------------------------------------------------------------------------- */
/*  Palette                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Palette keys instead of raw hex, so a recolour is one edit.
 *
 * `body`, `limb`, `accent` and `accent2` are per-agent: they resolve from the
 * agent's identity colour at runtime. `limb` is that colour darkened, exactly as
 * the original hand-written rig computed it; `accent2` is the identity's second
 * brand colour (see `RobotParts`, which supplies it per part).
 */
export type PaletteKey =
  | 'body'
  | 'limb'
  | 'accent'
  | 'accent2'
  | 'cream'
  | 'ink'
  | 'blush'
  | 'pink'
  | 'pinkDeep'
  | 'metal'
  | 'white'
  | 'yellow';

/** A literal brand colour, e.g. `#2A2A33`. Passed through untouched. */
export type HexColor = `#${string}`;

export const ROBOT_COLORS: Record<
  Exclude<PaletteKey, 'body' | 'limb' | 'accent' | 'accent2'>,
  string
> = {
  cream: '#fdfbf6',
  ink: '#3a4a58',
  blush: '#ffb4c0',
  pink: '#ff6b7a',
  pinkDeep: '#e05a6a',
  metal: '#c9d6e0',
  white: '#ffffff',
  yellow: '#ffc94d',
};

/** Default body colour, used for the exported `.glb` (which is agent-agnostic). */
export const ROBOT_BODY_DEFAULT = '#5CB8F2';

/** How much darker the limbs are than the body. Matches the original rig. */
export const LIMB_DARKEN = 0.82;

/**
 * Resolves a palette key to a hex colour for one agent.
 * Pure and allocation-light; safe to call during render.
 *
 * A hex literal is its own answer — that is how an identity paints a part in a
 * second brand colour without a palette key per provider.
 */
export function resolveRobotColor(key: PaletteKey | HexColor, accent: string): string {
  if (key.startsWith('#')) return key;
  switch (key) {
    case 'body':
    case 'accent':
    // `accent2` is the identity's second brand colour. Only `RobotParts` knows
    // it, and it passes it as `accent` for those parts; a caller that has no
    // second colour (the `.glb` generator, which never renders identity parts)
    // gets the body colour rather than a missing key.
    case 'accent2':
      return accent;
    case 'limb':
      return darkenHex(accent, LIMB_DARKEN);
    default:
      return ROBOT_COLORS[key as Exclude<PaletteKey, 'body' | 'limb' | 'accent' | 'accent2'>];
  }
}

/** Multiplies an `#rrggbb` colour by `factor`, clamped. */
export function darkenHex(hex: string, factor: number): string {
  const raw = hex.replace('#', '');
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw;
  const scale = (offset: number) =>
    Math.max(
      0,
      Math.min(255, Math.round(Number.parseInt(full.slice(offset, offset + 2), 16) * factor)),
    )
      .toString(16)
      .padStart(2, '0');
  return `#${scale(0)}${scale(2)}${scale(4)}`;
}

/* -------------------------------------------------------------------------- */
/*  Nodes — the movable joints                                                */
/* -------------------------------------------------------------------------- */

export type RobotNodeId =
  | 'root'
  | 'torso'
  | 'head'
  | 'antenna'
  | 'armL'
  | 'armR';

export interface RobotNode {
  id: RobotNodeId;
  parent: RobotNodeId | null;
  /** Position relative to the parent node. */
  position: readonly [number, number, number];
}

/**
 * Parent-first order: both consumers build the hierarchy in a single pass.
 * These positions are load-bearing — the animation rig rotates `torso`, `head`,
 * `antenna`, `armL` and `armR` around exactly these pivots.
 */
export const ROBOT_NODES: readonly RobotNode[] = [
  { id: 'root', parent: null, position: [0, 0, 0] },
  { id: 'torso', parent: 'root', position: [0, 0, 0] },
  { id: 'head', parent: 'torso', position: [0, 1.28, 0] },
  { id: 'antenna', parent: 'head', position: [0, 0.3, 0] },
  { id: 'armL', parent: 'root', position: [-0.42, 0.82, 0.02] },
  { id: 'armR', parent: 'root', position: [0.42, 0.82, 0.02] },
];

/* -------------------------------------------------------------------------- */
/*  Parts — the rigid blocks                                                  */
/* -------------------------------------------------------------------------- */

export type PartShape = 'box' | 'cylinder' | 'sphere';

export interface RobotPart {
  /** Stable name; also the mesh/node name inside the exported `.glb`. */
  id: string;
  /** Node this block is rigidly attached to. */
  node: RobotNodeId;
  shape: PartShape;
  /** Box dimensions, or a cylinder/sphere's bounding size. */
  size: readonly [number, number, number];
  position: readonly [number, number, number];
  /** Euler XYZ radians. */
  rotation?: readonly [number, number, number];
  color: PaletteKey | HexColor;
  /** `true` renders with `MeshBasicMaterial` (self-lit, ignores lighting). */
  unlit?: boolean;
  /** Cylinder radii / sphere radius. */
  radiusTop?: number;
  radiusBottom?: number;
  segments?: number;
}

/** Legs sit under the root: thighs on the seat, shins down, feet flat. */
const LEG_X = [-0.17, 0.17] as const;

const LEG_PARTS: RobotPart[] = LEG_X.flatMap((x, i) => {
  const side = i === 0 ? 'L' : 'R';
  return [
    {
      id: `thigh${side}`,
      node: 'root' as const,
      shape: 'box' as const,
      size: [0.2, 0.19, 0.5] as const,
      position: [x, 0.2, 0.2] as const,
      color: 'limb' as const,
    },
    {
      id: `shin${side}`,
      node: 'root' as const,
      shape: 'box' as const,
      size: [0.18, 0.56, 0.18] as const,
      position: [x, -0.09, 0.44] as const,
      color: 'limb' as const,
    },
    {
      id: `foot${side}`,
      node: 'root' as const,
      shape: 'box' as const,
      size: [0.21, 0.12, 0.28] as const,
      position: [x, -0.34, 0.52] as const,
      color: 'cream' as const,
    },
  ];
});

/**
 * Every block that never moves relative to its node.
 *
 * Runtime-driven geometry (eyes, mouth, hands, antenna ball) is declared in
 * `FACE`, `HANDS` and `ANTENNA_BALL` below, because the procedural rig animates
 * those through refs. The generator still includes them, so the `.glb` is a
 * complete robot.
 */
export const ROBOT_PARTS: readonly RobotPart[] = [
  ...LEG_PARTS,

  /* ---- torso ---- */
  {
    id: 'chest',
    node: 'torso',
    shape: 'box',
    size: [0.72, 0.68, 0.5],
    position: [0, 0.56, 0],
    color: 'body',
  },
  {
    id: 'belly',
    node: 'torso',
    shape: 'box',
    size: [0.5, 0.34, 0.02],
    position: [0, 0.4, 0.253],
    color: 'cream',
  },
  {
    id: 'bowTieL',
    node: 'torso',
    shape: 'box',
    size: [0.15, 0.11, 0.04],
    position: [-0.1, 0.76, 0.26],
    rotation: [0, 0, 0.25],
    color: 'pink',
  },
  {
    id: 'bowTieR',
    node: 'torso',
    shape: 'box',
    size: [0.15, 0.11, 0.04],
    position: [0.1, 0.76, 0.26],
    rotation: [0, 0, -0.25],
    color: 'pink',
  },
  {
    id: 'bowTieKnot',
    node: 'torso',
    shape: 'box',
    size: [0.07, 0.07, 0.04],
    position: [0, 0.76, 0.28],
    color: 'pinkDeep',
  },
  {
    id: 'nameBadge',
    node: 'torso',
    shape: 'box',
    size: [0.16, 0.1, 0.02],
    position: [0.2, 0.6, 0.26],
    color: 'cream',
  },
  {
    id: 'nameBadgeStripe',
    node: 'torso',
    shape: 'box',
    size: [0.1, 0.018, 0.01],
    position: [0.2, 0.6, 0.272],
    color: 'accent',
    unlit: true,
  },

  /* ---- head ---- */
  {
    id: 'cranium',
    node: 'head',
    shape: 'box',
    size: [0.78, 0.6, 0.54],
    position: [0, 0, 0],
    color: 'body',
  },
  {
    id: 'facePlate',
    node: 'head',
    shape: 'box',
    size: [0.62, 0.44, 0.02],
    position: [0, -0.01, 0.281],
    color: 'cream',
  },
  {
    id: 'earBoltL',
    node: 'head',
    shape: 'cylinder',
    size: [0.14, 0.06, 0.14],
    position: [-0.4, 0, 0],
    rotation: [0, 0, Math.PI / 2],
    radiusTop: 0.07,
    radiusBottom: 0.07,
    segments: 10,
    color: 'metal',
  },
  {
    id: 'earBoltR',
    node: 'head',
    shape: 'cylinder',
    size: [0.14, 0.06, 0.14],
    position: [0.4, 0, 0],
    rotation: [0, 0, Math.PI / 2],
    radiusTop: 0.07,
    radiusBottom: 0.07,
    segments: 10,
    color: 'metal',
  },

  /* ---- antenna stalk (the ball is animated, see ANTENNA_BALL) ---- */
  {
    id: 'antennaStalk',
    node: 'antenna',
    shape: 'cylinder',
    size: [0.05, 0.28, 0.05],
    position: [0, 0.14, 0],
    radiusTop: 0.02,
    radiusBottom: 0.025,
    segments: 8,
    color: 'metal',
  },

  /* ---- arms (the hands are animated, see HANDS) ---- */
  {
    id: 'upperArmL',
    node: 'armL',
    shape: 'box',
    size: [0.16, 0.4, 0.16],
    position: [0, -0.2, 0],
    color: 'limb',
  },
  {
    id: 'upperArmR',
    node: 'armR',
    shape: 'box',
    size: [0.16, 0.4, 0.16],
    position: [0, -0.2, 0],
    color: 'limb',
  },
];

/* -------------------------------------------------------------------------- */
/*  Runtime-driven geometry                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The face. Shared by the hand-written rig in `WorkerRobot.tsx` (which blinks,
 * squints and spins these through refs) and by the `.glb` generator (which
 * bakes them in a neutral pose).
 */
export const FACE = {
  /** Group holding both eyes, relative to the head node. */
  eyeGroup: { position: [0, 0.045, 0.3] as const },
  /** Horizontal distance of each eye from the centre line. */
  eyeOffsetX: 0.14,
  pupil: { size: [0.16, 0.17, 0.03] as const, color: 'ink' as const },
  glint: {
    size: [0.05, 0.05, 0.02] as const,
    position: [0.035, 0.045, 0.02] as const,
    color: 'white' as const,
  },
  /** The two crossed bars that replace the pupils in ERROR. */
  errorBar: {
    size: [0.15, 0.035, 0.03] as const,
    color: 'pink' as const,
    angle: Math.PI / 4,
  },
  mouth: {
    position: [0, -0.135, 0.3] as const,
    size: [0.2, 0.045, 0.03] as const,
    color: 'ink' as const,
  },
  blush: {
    position: [0.245, -0.05, 0.28] as const,
    size: [0.09, 0.05, 0.02] as const,
    color: 'blush' as const,
  },
} as const;

/** Block hands, relative to their arm node. The rig bobs them while typing. */
export const HANDS = {
  position: [0, -0.44, 0.02] as const,
  size: [0.19, 0.17, 0.19] as const,
  color: 'cream' as const,
} as const;

/** Antenna ball, relative to the antenna node. The rig pulses its scale. */
export const ANTENNA_BALL = {
  position: [0, 0.31, 0] as const,
  radius: 0.075,
  segments: 14,
  color: 'yellow' as const,
} as const;

/* -------------------------------------------------------------------------- */
/*  Identity shapes                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The head silhouette. `box` is the plain cranium every bot has; the others add
 * blocks around it, so one neutral `.glb` stays valid for all of them.
 */
export type ShellId = 'box' | 'cat' | 'arch' | 'hex' | 'pixel' | 'round' | 'manga';

/**
 * What sits on the antenna. `ball` is the original yellow sphere and is drawn by
 * the rig itself (it pulses), so its table entry is empty.
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

/**
 * Head-space envelope a shell may occupy. The cranium is 0.78 x 0.6 x 0.54, so
 * this leaves ~0.17 m of reach on each side and ~0.32 m above: enough for a bold
 * outline, not enough to poke into the chest or the neighbouring desk.
 */
export const SHELL_ENVELOPE = {
  min: [-0.56, -0.42, -0.32] as const,
  max: [0.56, 0.62, 0.32] as const,
};

/**
 * Antenna-space envelope for a topper: x +-0.11, y 0.24..0.51, z +-0.06.
 *
 * The ceiling is load-bearing. `ANTENNA_BALL` already reaches y = 0.385 here, and
 * `ROBOT_ENVELOPE_TOP` (= 2.09 m in root space) is what lifts the name pill clear
 * of the tallest topper. Raising it clips the pill on short viewports.
 */
export const TOPPER_ENVELOPE = {
  min: [-0.11, 0.24, -0.06] as const,
  max: [0.11, 0.51, 0.06] as const,
};

/**
 * Torso-space envelope for an emblem: the cream belly panel's own slab, plus a
 * little room in front of it.
 *
 * The panel spans z 0.243..0.263, so the back limit is the panel's back face —
 * an emblem that starts behind it would be buried inside the chest. The front
 * limit keeps the badge from floating off the body.
 */
export const EMBLEM_ENVELOPE = {
  min: [-0.24, 0.235, 0.243] as const,
  max: [0.24, 0.565, 0.28] as const,
};

/**
 * Head shells, relative to the `head` node.
 *
 * Every entry is *additive*: the cranium, face plate and ear bolts stay exactly
 * where they are, and these blocks grow the silhouette around them. That is what
 * lets one neutral `.glb` serve every identity — the shell is mounted at runtime.
 *
 * Authoring rules, both enforced by `npm run identity:test`:
 *   - stay inside `SHELL_ENVELOPE`;
 *   - never enter the face box (`FACE`, grown 5 mm). The face is the animation
 *     surface for all four statuses and must stay uncovered from every angle.
 *
 * Where the boldness comes from: a feature reads at overview size only if it
 * changes the outline by ~15% of the head's width. Chamfers alone do not.
 */
export const SHELLS: Record<ShellId, readonly RobotPart[]> = {
  /** The body the office shipped with: no shell at all. */
  box: [],

  /** CodeBuddy: two cat ears. The outline gain is entirely in the ears. */
  cat: [
    {
      id: 'shellEarL',
      node: 'head',
      shape: 'box',
      size: [0.16, 0.3, 0.16],
      position: [-0.26, 0.42, 0],
      rotation: [0, 0, 0.35],
      color: 'accent2',
    },
    {
      id: 'shellEarR',
      node: 'head',
      shape: 'box',
      size: [0.16, 0.3, 0.16],
      position: [0.26, 0.42, 0],
      rotation: [0, 0, -0.35],
      color: 'accent2',
    },
  ],

  /** Antigravity: a doorway arch wrapping the head, the crown in the second brand colour. */
  arch: [
    {
      id: 'shellArchTop',
      node: 'head',
      shape: 'box',
      size: [0.96, 0.13, 0.62],
      position: [0, 0.35, 0],
      color: 'accent2',
    },
    {
      id: 'shellArchPostL',
      node: 'head',
      shape: 'box',
      size: [0.12, 0.44, 0.6],
      position: [-0.46, 0.09, 0],
      color: 'body',
    },
    {
      id: 'shellArchPostR',
      node: 'head',
      shape: 'box',
      size: [0.12, 0.44, 0.6],
      position: [0.46, 0.09, 0],
      color: 'body',
    },
  ],

  /**
   * Codex and OpenAI: a hexagon. Four 45-degree chamfers carry the outline out
   * past the cranium, bridged by a bar above and below.
   */
  hex: [
    {
      id: 'shellHexTop',
      node: 'head',
      shape: 'box',
      size: [0.56, 0.09, 0.56],
      position: [0, 0.34, 0],
      color: 'body',
    },
    {
      id: 'shellHexBottom',
      node: 'head',
      shape: 'box',
      size: [0.56, 0.09, 0.56],
      position: [0, -0.34, 0],
      color: 'body',
    },
    {
      id: 'shellHexChamferTR',
      node: 'head',
      shape: 'box',
      size: [0.2, 0.09, 0.56],
      position: [0.37, 0.3, 0],
      rotation: [0, 0, -Math.PI / 4],
      color: 'body',
    },
    {
      id: 'shellHexChamferTL',
      node: 'head',
      shape: 'box',
      size: [0.2, 0.09, 0.56],
      position: [-0.37, 0.3, 0],
      rotation: [0, 0, Math.PI / 4],
      color: 'body',
    },
    {
      id: 'shellHexChamferBR',
      node: 'head',
      shape: 'box',
      size: [0.2, 0.09, 0.56],
      position: [0.37, -0.3, 0],
      rotation: [0, 0, Math.PI / 4],
      color: 'body',
    },
    {
      id: 'shellHexChamferBL',
      node: 'head',
      shape: 'box',
      size: [0.2, 0.09, 0.56],
      position: [-0.37, -0.3, 0],
      rotation: [0, 0, -Math.PI / 4],
      color: 'body',
    },
  ],

  /** Kilo Code: a pixel crown — four stepped blocks, deliberately uneven. */
  pixel: [
    {
      id: 'shellPixel1',
      node: 'head',
      shape: 'box',
      size: [0.18, 0.16, 0.52],
      position: [-0.3, 0.36, 0],
      color: 'body',
    },
    {
      id: 'shellPixel2',
      node: 'head',
      shape: 'box',
      size: [0.18, 0.26, 0.52],
      position: [-0.1, 0.41, 0],
      color: 'accent2',
    },
    {
      id: 'shellPixel3',
      node: 'head',
      shape: 'box',
      size: [0.18, 0.2, 0.52],
      position: [0.1, 0.38, 0],
      color: 'body',
    },
    {
      id: 'shellPixel4',
      node: 'head',
      shape: 'box',
      size: [0.18, 0.12, 0.52],
      position: [0.3, 0.34, 0],
      color: 'body',
    },
  ],

  /**
   * OpenCode: a rounded crown — two crossed tubes lying over the top of the
   * cranium. The tube's axis is its Y, so the long side is written into `size[1]`
   * and rotated into place; that keeps the bounds maths (which rotates the
   * size box) and the rendered cylinder in agreement.
   */
  round: [
    {
      id: 'shellRoundCapX',
      node: 'head',
      shape: 'cylinder',
      size: [0.36, 0.86, 0.36],
      position: [0, 0.36, 0],
      rotation: [0, 0, Math.PI / 2],
      radiusTop: 0.18,
      radiusBottom: 0.18,
      segments: 16,
      color: 'body',
    },
    {
      id: 'shellRoundCapZ',
      node: 'head',
      shape: 'cylinder',
      size: [0.36, 0.6, 0.36],
      position: [0, 0.36, 0],
      rotation: [Math.PI / 2, 0, 0],
      radiusTop: 0.18,
      radiusBottom: 0.18,
      segments: 16,
      color: 'body',
    },
  ],

  /** Nous: manga hair — a mass on top plus a fringe of uneven strands over the brow. */
  manga: [
    {
      id: 'shellHairCap',
      node: 'head',
      shape: 'box',
      size: [0.82, 0.14, 0.6],
      position: [0, 0.31, 0],
      color: 'accent2',
    },
    {
      id: 'shellHairL',
      node: 'head',
      shape: 'box',
      size: [0.1, 0.2, 0.06],
      position: [-0.24, 0.25, 0.27],
      color: 'accent2',
    },
    {
      id: 'shellHairMidL',
      node: 'head',
      shape: 'box',
      size: [0.1, 0.16, 0.06],
      position: [-0.12, 0.23, 0.27],
      color: 'accent2',
    },
    {
      id: 'shellHairMid',
      node: 'head',
      shape: 'box',
      size: [0.1, 0.22, 0.06],
      position: [0, 0.26, 0.27],
      color: 'accent2',
    },
    {
      id: 'shellHairMidR',
      node: 'head',
      shape: 'box',
      size: [0.1, 0.16, 0.06],
      position: [0.12, 0.23, 0.27],
      color: 'accent2',
    },
    {
      id: 'shellHairR',
      node: 'head',
      shape: 'box',
      size: [0.1, 0.2, 0.06],
      position: [0.24, 0.25, 0.27],
      color: 'accent2',
    },
  ],
};

/**
 * Antenna toppers, relative to the `antenna` node.
 *
 * A topper *replaces* the yellow ball rather than joining it, so `ball` has no
 * parts: the rig draws that sphere itself because it pulses through a ref.
 * Everything here must fit `TOPPER_ENVELOPE`.
 */
export const TOPPERS: Record<TopperId, readonly RobotPart[]> = {
  ball: [],

  /** CodeBuddy: a tiny cat face on the aerial. */
  catface: [
    {
      id: 'topCatEarL',
      node: 'antenna',
      shape: 'box',
      size: [0.06, 0.09, 0.05],
      position: [-0.055, 0.44, 0],
      rotation: [0, 0, 0.4],
      color: 'accent2',
    },
    {
      id: 'topCatEarR',
      node: 'antenna',
      shape: 'box',
      size: [0.06, 0.09, 0.05],
      position: [0.055, 0.44, 0],
      rotation: [0, 0, -0.4],
      color: 'accent2',
    },
    {
      id: 'topCatFace',
      node: 'antenna',
      shape: 'box',
      size: [0.14, 0.12, 0.05],
      position: [0, 0.34, 0.02],
      color: 'body',
    },
  ],

  /** Antigravity: an inverted U, the same doorway motif as the shell. */
  arch: [
    {
      id: 'topArchTop',
      node: 'antenna',
      shape: 'box',
      size: [0.2, 0.05, 0.06],
      position: [0, 0.47, 0],
      color: 'accent2',
    },
    {
      id: 'topArchLegL',
      node: 'antenna',
      shape: 'box',
      size: [0.05, 0.2, 0.06],
      position: [-0.075, 0.37, 0],
      color: 'body',
    },
    {
      id: 'topArchLegR',
      node: 'antenna',
      shape: 'box',
      size: [0.05, 0.2, 0.06],
      position: [0.075, 0.37, 0],
      color: 'body',
    },
  ],

  /** Codex: three crossed bars — a knot, not a ring. */
  knot: [
    {
      id: 'topKnotA',
      node: 'antenna',
      shape: 'box',
      size: [0.2, 0.05, 0.05],
      position: [0, 0.38, 0],
      rotation: [0, 0, 0.9],
      color: 'body',
    },
    {
      id: 'topKnotB',
      node: 'antenna',
      shape: 'box',
      size: [0.2, 0.05, 0.05],
      position: [0, 0.38, 0],
      rotation: [0, 0, -0.9],
      color: 'body',
    },
    {
      id: 'topKnotC',
      node: 'antenna',
      shape: 'box',
      size: [0.2, 0.05, 0.05],
      position: [0, 0.38, 0],
      color: 'body',
    },
  ],

  /** Gemini: an eight-point sparkle — two diagonals plus two short crosses. */
  sparkle: [
    {
      id: 'topSparkleD1',
      node: 'antenna',
      shape: 'box',
      size: [0.22, 0.06, 0.05],
      position: [0, 0.38, 0],
      rotation: [0, 0, Math.PI / 4],
      color: 'body',
    },
    {
      id: 'topSparkleD2',
      node: 'antenna',
      shape: 'box',
      size: [0.22, 0.06, 0.05],
      position: [0, 0.38, 0],
      rotation: [0, 0, -Math.PI / 4],
      color: 'body',
    },
    {
      id: 'topSparkleH',
      node: 'antenna',
      shape: 'box',
      size: [0.16, 0.05, 0.05],
      position: [0, 0.38, 0],
      color: 'body',
    },
    {
      id: 'topSparkleV',
      node: 'antenna',
      shape: 'box',
      size: [0.05, 0.16, 0.05],
      position: [0, 0.38, 0],
      color: 'body',
    },
  ],

  /** Kilo Code: a K built from five blocks, keeping the pixel language. */
  pixelK: [
    {
      id: 'topKiloStem',
      node: 'antenna',
      shape: 'box',
      size: [0.05, 0.22, 0.05],
      position: [-0.05, 0.38, 0],
      color: 'body',
    },
    {
      id: 'topKiloArm1',
      node: 'antenna',
      shape: 'box',
      size: [0.06, 0.06, 0.05],
      position: [0, 0.44, 0],
      color: 'body',
    },
    {
      id: 'topKiloArm2',
      node: 'antenna',
      shape: 'box',
      size: [0.06, 0.06, 0.05],
      position: [0.055, 0.47, 0],
      color: 'body',
    },
    {
      id: 'topKiloLeg1',
      node: 'antenna',
      shape: 'box',
      size: [0.06, 0.06, 0.05],
      position: [0, 0.32, 0],
      color: 'body',
    },
    {
      id: 'topKiloLeg2',
      node: 'antenna',
      shape: 'box',
      size: [0.06, 0.06, 0.05],
      position: [0.055, 0.29, 0],
      color: 'body',
    },
  ],

  /** NVIDIA: the eye — two lids and a pupil. */
  eye: [
    {
      id: 'topEyeLidUp',
      node: 'antenna',
      shape: 'box',
      size: [0.2, 0.05, 0.05],
      position: [0, 0.42, 0],
      rotation: [0, 0, 0.35],
      color: 'body',
    },
    {
      id: 'topEyeLidDown',
      node: 'antenna',
      shape: 'box',
      size: [0.2, 0.05, 0.05],
      position: [0, 0.34, 0],
      rotation: [0, 0, -0.35],
      color: 'body',
    },
    {
      id: 'topEyePupil',
      node: 'antenna',
      shape: 'box',
      size: [0.07, 0.07, 0.06],
      position: [0, 0.38, 0.01],
      color: 'accent2',
    },
  ],

  /** Nous: three hanging strands and a bar, the aerial's version of the fringe. */
  nfringe: [
    {
      id: 'topFringeCap',
      node: 'antenna',
      shape: 'box',
      size: [0.2, 0.06, 0.05],
      position: [0, 0.47, 0],
      color: 'accent2',
    },
    {
      id: 'topFringeL',
      node: 'antenna',
      shape: 'box',
      size: [0.05, 0.16, 0.05],
      position: [-0.06, 0.36, 0.02],
      color: 'accent2',
    },
    {
      id: 'topFringeM',
      node: 'antenna',
      shape: 'box',
      size: [0.05, 0.2, 0.05],
      position: [0, 0.38, 0.02],
      color: 'accent2',
    },
    {
      id: 'topFringeR',
      node: 'antenna',
      shape: 'box',
      size: [0.05, 0.16, 0.05],
      position: [0.06, 0.36, 0.02],
      color: 'accent2',
    },
  ],

  /** OpenCode: a prompt — top bar, chevron, underscore. */
  terminal: [
    {
      id: 'topTermBar',
      node: 'antenna',
      shape: 'box',
      size: [0.18, 0.05, 0.05],
      position: [0, 0.46, 0],
      color: 'body',
    },
    {
      id: 'topTermChevUp',
      node: 'antenna',
      shape: 'box',
      size: [0.1, 0.05, 0.05],
      position: [-0.04, 0.4, 0],
      rotation: [0, 0, -0.7],
      color: 'body',
    },
    {
      id: 'topTermChevDown',
      node: 'antenna',
      shape: 'box',
      size: [0.1, 0.05, 0.05],
      position: [-0.04, 0.3, 0],
      rotation: [0, 0, 0.7],
      color: 'body',
    },
    {
      id: 'topTermUnderscore',
      node: 'antenna',
      shape: 'box',
      size: [0.1, 0.05, 0.05],
      position: [0.05, 0.28, 0],
      color: 'body',
    },
  ],

  /** OpenRouter: three arrows pointing opposite ways, as in its mark. */
  router: [
    {
      id: 'topRouterShaft1',
      node: 'antenna',
      shape: 'box',
      size: [0.16, 0.04, 0.05],
      position: [-0.01, 0.46, 0],
      color: 'body',
    },
    {
      id: 'topRouterHead1',
      node: 'antenna',
      shape: 'box',
      size: [0.05, 0.1, 0.05],
      position: [0.08, 0.46, 0],
      color: 'body',
    },
    {
      id: 'topRouterShaft2',
      node: 'antenna',
      shape: 'box',
      size: [0.16, 0.04, 0.05],
      position: [0.01, 0.38, 0],
      color: 'body',
    },
    {
      id: 'topRouterHead2',
      node: 'antenna',
      shape: 'box',
      size: [0.05, 0.1, 0.05],
      position: [-0.08, 0.38, 0],
      color: 'body',
    },
    {
      id: 'topRouterShaft3',
      node: 'antenna',
      shape: 'box',
      size: [0.16, 0.04, 0.05],
      position: [-0.01, 0.3, 0],
      color: 'body',
    },
    {
      id: 'topRouterHead3',
      node: 'antenna',
      shape: 'box',
      size: [0.05, 0.1, 0.05],
      position: [0.08, 0.3, 0],
      color: 'body',
    },
  ],

  /** Anthropic: three radial strokes — the asterisk, not a letter. */
  burst: [
    {
      id: 'topBurstA',
      node: 'antenna',
      shape: 'box',
      size: [0.2, 0.045, 0.05],
      position: [0, 0.38, 0],
      rotation: [0, 0, 0.55],
      color: 'body',
    },
    {
      id: 'topBurstB',
      node: 'antenna',
      shape: 'box',
      size: [0.2, 0.045, 0.05],
      position: [0, 0.38, 0],
      rotation: [0, 0, -0.55],
      color: 'body',
    },
    {
      id: 'topBurstC',
      node: 'antenna',
      shape: 'box',
      size: [0.2, 0.045, 0.05],
      position: [0, 0.38, 0],
      color: 'body',
    },
  ],

  /** OpenAI: a hexagonal rosette — six bars, visibly different from Codex's knot. */
  openai: [
    {
      id: 'topOpenaiTop',
      node: 'antenna',
      shape: 'box',
      size: [0.1, 0.04, 0.05],
      position: [0, 0.47, 0],
      color: 'body',
    },
    {
      id: 'topOpenaiBottom',
      node: 'antenna',
      shape: 'box',
      size: [0.1, 0.04, 0.05],
      position: [0, 0.29, 0],
      color: 'body',
    },
    {
      id: 'topOpenaiUR',
      node: 'antenna',
      shape: 'box',
      size: [0.1, 0.04, 0.05],
      position: [0.045, 0.42, 0],
      rotation: [0, 0, Math.PI / 3],
      color: 'body',
    },
    {
      id: 'topOpenaiUL',
      node: 'antenna',
      shape: 'box',
      size: [0.1, 0.04, 0.05],
      position: [-0.045, 0.42, 0],
      rotation: [0, 0, -Math.PI / 3],
      color: 'body',
    },
    {
      id: 'topOpenaiLR',
      node: 'antenna',
      shape: 'box',
      size: [0.1, 0.04, 0.05],
      position: [0.045, 0.34, 0],
      rotation: [0, 0, -Math.PI / 3],
      color: 'body',
    },
    {
      id: 'topOpenaiLL',
      node: 'antenna',
      shape: 'box',
      size: [0.1, 0.04, 0.05],
      position: [-0.045, 0.34, 0],
      rotation: [0, 0, Math.PI / 3],
      color: 'body',
    },
  ],

  /** Ollama: a llama head with two ears and a muzzle. */
  llama: [
    {
      id: 'topLlamaHead',
      node: 'antenna',
      shape: 'box',
      size: [0.1, 0.12, 0.06],
      position: [0, 0.35, 0.01],
      color: 'body',
    },
    {
      id: 'topLlamaEarL',
      node: 'antenna',
      shape: 'box',
      size: [0.04, 0.1, 0.05],
      position: [-0.035, 0.46, 0],
      color: 'body',
    },
    {
      id: 'topLlamaEarR',
      node: 'antenna',
      shape: 'box',
      size: [0.04, 0.1, 0.05],
      position: [0.035, 0.46, 0],
      color: 'body',
    },
    {
      id: 'topLlamaMuzzle',
      node: 'antenna',
      shape: 'box',
      size: [0.07, 0.05, 0.06],
      position: [0, 0.285, 0.02],
      color: 'accent2',
    },
  ],
};

/**
 * Chest emblems, relative to the `torso` node.
 *
 * They sit on the existing cream `belly` panel — no new plate — so they never
 * collide with the bow tie above or the name badge beside it. `unlit` keeps the
 * brand colour from going muddy under the key light, the way `nameBadgeStripe`
 * already does.
 */
export const EMBLEMS: Record<EmblemId, readonly RobotPart[]> = {
  none: [],

  catface: [
    {
      id: 'emCatEarL',
      node: 'torso',
      shape: 'box',
      size: [0.07, 0.07, 0.012],
      position: [-0.06, 0.49, 0.267],
      rotation: [0, 0, 0.5],
      color: 'accent2',
      unlit: true,
    },
    {
      id: 'emCatEarR',
      node: 'torso',
      shape: 'box',
      size: [0.07, 0.07, 0.012],
      position: [0.06, 0.49, 0.267],
      rotation: [0, 0, -0.5],
      color: 'accent2',
      unlit: true,
    },
    {
      id: 'emCatFace',
      node: 'torso',
      shape: 'box',
      size: [0.16, 0.13, 0.012],
      position: [0, 0.4, 0.267],
      color: 'accent2',
      unlit: true,
    },
  ],

  arch: [
    {
      id: 'emArchTop',
      node: 'torso',
      shape: 'box',
      size: [0.24, 0.05, 0.012],
      position: [0, 0.47, 0.267],
      color: 'accent2',
      unlit: true,
    },
    {
      id: 'emArchLegL',
      node: 'torso',
      shape: 'box',
      size: [0.05, 0.18, 0.012],
      position: [-0.095, 0.38, 0.267],
      color: 'accent2',
      unlit: true,
    },
    {
      id: 'emArchLegR',
      node: 'torso',
      shape: 'box',
      size: [0.05, 0.18, 0.012],
      position: [0.095, 0.38, 0.267],
      color: 'accent2',
      unlit: true,
    },
  ],

  knot: [
    {
      id: 'emKnotA',
      node: 'torso',
      shape: 'box',
      size: [0.2, 0.045, 0.012],
      position: [0, 0.4, 0.267],
      rotation: [0, 0, 0.9],
      color: 'body',
      unlit: true,
    },
    {
      id: 'emKnotB',
      node: 'torso',
      shape: 'box',
      size: [0.2, 0.045, 0.012],
      position: [0, 0.4, 0.267],
      rotation: [0, 0, -0.9],
      color: 'body',
      unlit: true,
    },
    {
      id: 'emKnotC',
      node: 'torso',
      shape: 'box',
      size: [0.2, 0.045, 0.012],
      position: [0, 0.4, 0.267],
      color: 'body',
      unlit: true,
    },
  ],

  sparkle: [
    {
      id: 'emSparkleD1',
      node: 'torso',
      shape: 'box',
      size: [0.24, 0.05, 0.012],
      position: [0, 0.4, 0.267],
      rotation: [0, 0, Math.PI / 4],
      color: 'body',
      unlit: true,
    },
    {
      id: 'emSparkleD2',
      node: 'torso',
      shape: 'box',
      size: [0.24, 0.05, 0.012],
      position: [0, 0.4, 0.267],
      rotation: [0, 0, -Math.PI / 4],
      color: 'body',
      unlit: true,
    },
    {
      id: 'emSparkleH',
      node: 'torso',
      shape: 'box',
      size: [0.14, 0.045, 0.012],
      position: [0, 0.4, 0.267],
      color: 'body',
      unlit: true,
    },
    {
      id: 'emSparkleV',
      node: 'torso',
      shape: 'box',
      size: [0.045, 0.14, 0.012],
      position: [0, 0.4, 0.267],
      color: 'body',
      unlit: true,
    },
  ],

  pixelK: [
    {
      id: 'emKiloStem',
      node: 'torso',
      shape: 'box',
      size: [0.045, 0.2, 0.012],
      position: [-0.045, 0.4, 0.267],
      color: 'body',
      unlit: true,
    },
    {
      id: 'emKiloArm1',
      node: 'torso',
      shape: 'box',
      size: [0.05, 0.05, 0.012],
      position: [0, 0.46, 0.267],
      color: 'body',
      unlit: true,
    },
    {
      id: 'emKiloArm2',
      node: 'torso',
      shape: 'box',
      size: [0.05, 0.05, 0.012],
      position: [0.045, 0.49, 0.267],
      color: 'body',
      unlit: true,
    },
    {
      id: 'emKiloLeg1',
      node: 'torso',
      shape: 'box',
      size: [0.05, 0.05, 0.012],
      position: [0, 0.34, 0.267],
      color: 'body',
      unlit: true,
    },
    {
      id: 'emKiloLeg2',
      node: 'torso',
      shape: 'box',
      size: [0.05, 0.05, 0.012],
      position: [0.045, 0.31, 0.267],
      color: 'body',
      unlit: true,
    },
  ],

  eye: [
    {
      id: 'emEyeLidUp',
      node: 'torso',
      shape: 'box',
      size: [0.24, 0.045, 0.012],
      position: [0, 0.44, 0.267],
      rotation: [0, 0, 0.35],
      color: 'body',
      unlit: true,
    },
    {
      id: 'emEyeLidDown',
      node: 'torso',
      shape: 'box',
      size: [0.24, 0.045, 0.012],
      position: [0, 0.36, 0.267],
      rotation: [0, 0, -0.35],
      color: 'body',
      unlit: true,
    },
    {
      id: 'emEyePupil',
      node: 'torso',
      shape: 'box',
      size: [0.07, 0.07, 0.012],
      position: [0, 0.4, 0.268],
      color: 'accent2',
      unlit: true,
    },
  ],

  nfringe: [
    {
      id: 'emFringeCap',
      node: 'torso',
      shape: 'box',
      size: [0.18, 0.05, 0.012],
      position: [0, 0.48, 0.267],
      color: 'accent2',
      unlit: true,
    },
    {
      id: 'emFringeL',
      node: 'torso',
      shape: 'box',
      size: [0.045, 0.14, 0.012],
      position: [-0.055, 0.38, 0.267],
      color: 'accent2',
      unlit: true,
    },
    {
      id: 'emFringeM',
      node: 'torso',
      shape: 'box',
      size: [0.045, 0.18, 0.012],
      position: [0, 0.4, 0.267],
      color: 'accent2',
      unlit: true,
    },
    {
      id: 'emFringeR',
      node: 'torso',
      shape: 'box',
      size: [0.045, 0.14, 0.012],
      position: [0.055, 0.38, 0.267],
      color: 'accent2',
      unlit: true,
    },
  ],

  terminal: [
    {
      id: 'emTermBar',
      node: 'torso',
      shape: 'box',
      size: [0.18, 0.045, 0.012],
      position: [0, 0.47, 0.267],
      color: 'body',
      unlit: true,
    },
    {
      id: 'emTermChevUp',
      node: 'torso',
      shape: 'box',
      size: [0.09, 0.045, 0.012],
      position: [-0.035, 0.42, 0.267],
      rotation: [0, 0, -0.7],
      color: 'body',
      unlit: true,
    },
    {
      id: 'emTermChevDown',
      node: 'torso',
      shape: 'box',
      size: [0.09, 0.045, 0.012],
      position: [-0.035, 0.34, 0.267],
      rotation: [0, 0, 0.7],
      color: 'body',
      unlit: true,
    },
    {
      id: 'emTermUnderscore',
      node: 'torso',
      shape: 'box',
      size: [0.09, 0.045, 0.012],
      position: [0.045, 0.32, 0.267],
      color: 'body',
      unlit: true,
    },
  ],

  router: [
    {
      id: 'emRouterShaft1',
      node: 'torso',
      shape: 'box',
      size: [0.14, 0.035, 0.012],
      position: [-0.01, 0.47, 0.267],
      color: 'body',
      unlit: true,
    },
    {
      id: 'emRouterHead1',
      node: 'torso',
      shape: 'box',
      size: [0.045, 0.09, 0.012],
      position: [0.0725, 0.47, 0.267],
      color: 'body',
      unlit: true,
    },
    {
      id: 'emRouterShaft2',
      node: 'torso',
      shape: 'box',
      size: [0.14, 0.035, 0.012],
      position: [0.01, 0.4, 0.267],
      color: 'body',
      unlit: true,
    },
    {
      id: 'emRouterHead2',
      node: 'torso',
      shape: 'box',
      size: [0.045, 0.09, 0.012],
      position: [-0.0725, 0.4, 0.267],
      color: 'body',
      unlit: true,
    },
    {
      id: 'emRouterShaft3',
      node: 'torso',
      shape: 'box',
      size: [0.14, 0.035, 0.012],
      position: [-0.01, 0.33, 0.267],
      color: 'body',
      unlit: true,
    },
    {
      id: 'emRouterHead3',
      node: 'torso',
      shape: 'box',
      size: [0.045, 0.09, 0.012],
      position: [0.0725, 0.33, 0.267],
      color: 'body',
      unlit: true,
    },
  ],

  burst: [
    {
      id: 'emBurstA',
      node: 'torso',
      shape: 'box',
      size: [0.2, 0.045, 0.012],
      position: [0, 0.4, 0.267],
      rotation: [0, 0, 0.55],
      color: 'body',
      unlit: true,
    },
    {
      id: 'emBurstB',
      node: 'torso',
      shape: 'box',
      size: [0.2, 0.045, 0.012],
      position: [0, 0.4, 0.267],
      rotation: [0, 0, -0.55],
      color: 'body',
      unlit: true,
    },
    {
      id: 'emBurstC',
      node: 'torso',
      shape: 'box',
      size: [0.2, 0.045, 0.012],
      position: [0, 0.4, 0.267],
      color: 'body',
      unlit: true,
    },
  ],

  openai: [
    {
      id: 'emOpenaiTop',
      node: 'torso',
      shape: 'box',
      size: [0.1, 0.035, 0.012],
      position: [0, 0.47, 0.267],
      color: 'body',
      unlit: true,
    },
    {
      id: 'emOpenaiBottom',
      node: 'torso',
      shape: 'box',
      size: [0.1, 0.035, 0.012],
      position: [0, 0.33, 0.267],
      color: 'body',
      unlit: true,
    },
    {
      id: 'emOpenaiUR',
      node: 'torso',
      shape: 'box',
      size: [0.09, 0.035, 0.012],
      position: [0.0425, 0.44, 0.267],
      rotation: [0, 0, Math.PI / 3],
      color: 'body',
      unlit: true,
    },
    {
      id: 'emOpenaiUL',
      node: 'torso',
      shape: 'box',
      size: [0.09, 0.035, 0.012],
      position: [-0.0425, 0.44, 0.267],
      rotation: [0, 0, -Math.PI / 3],
      color: 'body',
      unlit: true,
    },
    {
      id: 'emOpenaiLR',
      node: 'torso',
      shape: 'box',
      size: [0.09, 0.035, 0.012],
      position: [0.0425, 0.36, 0.267],
      rotation: [0, 0, -Math.PI / 3],
      color: 'body',
      unlit: true,
    },
    {
      id: 'emOpenaiLL',
      node: 'torso',
      shape: 'box',
      size: [0.09, 0.035, 0.012],
      position: [-0.0425, 0.36, 0.267],
      rotation: [0, 0, Math.PI / 3],
      color: 'body',
      unlit: true,
    },
  ],

  llama: [
    {
      id: 'emLlamaHead',
      node: 'torso',
      shape: 'box',
      size: [0.1, 0.12, 0.012],
      position: [0, 0.37, 0.267],
      color: 'body',
      unlit: true,
    },
    {
      id: 'emLlamaEarL',
      node: 'torso',
      shape: 'box',
      size: [0.035, 0.08, 0.012],
      position: [-0.035, 0.46, 0.267],
      color: 'body',
      unlit: true,
    },
    {
      id: 'emLlamaEarR',
      node: 'torso',
      shape: 'box',
      size: [0.035, 0.08, 0.012],
      position: [0.035, 0.46, 0.267],
      color: 'body',
      unlit: true,
    },
    {
      id: 'emLlamaMuzzle',
      node: 'torso',
      shape: 'box',
      size: [0.07, 0.05, 0.012],
      position: [0, 0.305, 0.267],
      color: 'accent2',
      unlit: true,
    },
  ],
};

/** The shape half of an identity: everything the part tables need. */
export interface IdentityShape {
  shell: ShellId;
  topper: TopperId;
  emblem: EmblemId;
}

/**
 * The blocks an identity adds — shells, topper and emblem, never the base body.
 *
 * This is the only function the mounted `.glb` may use: its joints already carry
 * the baked `ROBOT_PARTS`, so adding them again would double every block.
 */
export function identityPartsFor(identity: IdentityShape): readonly RobotPart[] {
  return [
    ...SHELLS[identity.shell],
    ...TOPPERS[identity.topper],
    ...EMBLEMS[identity.emblem],
  ];
}

/** The whole robot for one identity: the shared body plus what makes it *that* bot. */
export function robotPartsFor(identity: IdentityShape): readonly RobotPart[] {
  return [...ROBOT_PARTS, ...identityPartsFor(identity)];
}

/* -------------------------------------------------------------------------- */
/*  Bounds                                                                    */
/* -------------------------------------------------------------------------- */

export interface RobotBounds {
  min: [number, number, number];
  max: [number, number, number];
  height: number;
}

/** Rotation matrix from Euler XYZ, written out to keep this module dependency-free. */
function rotatedHalfExtents(
  half: readonly [number, number, number],
  rotation: readonly [number, number, number],
): [number, number, number] {
  const [rx, ry, rz] = rotation;
  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const cz = Math.cos(rz);
  const sz = Math.sin(rz);

  // R = Rx * Ry * Rz (three.js default 'XYZ' order)
  const m00 = cy * cz;
  const m01 = -cy * sz;
  const m02 = sy;
  const m10 = sx * sy * cz + cx * sz;
  const m11 = -sx * sy * sz + cx * cz;
  const m12 = -sx * cy;
  const m20 = -cx * sy * cz + sx * sz;
  const m21 = cx * sy * sz + sx * cz;
  const m22 = cx * cy;

  const [hx, hy, hz] = half;
  return [
    Math.abs(m00) * hx + Math.abs(m01) * hy + Math.abs(m02) * hz,
    Math.abs(m10) * hx + Math.abs(m11) * hy + Math.abs(m12) * hz,
    Math.abs(m20) * hx + Math.abs(m21) * hy + Math.abs(m22) * hz,
  ];
}

/**
 * Accumulated position of a node in root space.
 * Used by the procedural rig so joint pivots come from the spec, not a copy.
 */
export function robotNodePosition(id: RobotNodeId): [number, number, number] {
  const chain: RobotNode[] = [];
  let cursor: RobotNodeId | null = id;
  while (cursor) {
    const node = ROBOT_NODES.find((candidate) => candidate.id === cursor);
    if (!node) break;
    chain.unshift(node);
    cursor = node.parent;
  }
  return chain.reduce<[number, number, number]>(
    (sum, node) => [
      sum[0] + node.position[0],
      sum[1] + node.position[1],
      sum[2] + node.position[2],
    ],
    [0, 0, 0],
  );
}

/**
 * Axis-aligned bounds of the robot in root space.
 *
 * Used to normalise a hand-made `.glb` to the procedural robot's height, and
 * cross-checked against three's own `Box3` by the generator — if the two ever
 * disagree the build fails.
 *
 * `extraParts` folds in blocks that are not part of the neutral body. Identity
 * parts must NOT be passed here by anything that feeds `ROBOT_HEIGHT`: that
 * number is the *body* height, and scaling the neutral `.glb` by an envelope
 * height would lift its hips off the chair.
 */
export function robotBounds(extraParts: readonly RobotPart[] = []): RobotBounds {
  const nodePosition = robotNodePosition;

  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  const include = (
    node: RobotNodeId,
    position: readonly [number, number, number],
    half: readonly [number, number, number],
    rotation?: readonly [number, number, number],
  ) => {
    const base = nodePosition(node);
    const [hx, hy, hz] = rotation ? rotatedHalfExtents(half, rotation) : half;
    const center: [number, number, number] = [
      base[0] + position[0],
      base[1] + position[1],
      base[2] + position[2],
    ];
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], center[axis] - [hx, hy, hz][axis]);
      max[axis] = Math.max(max[axis], center[axis] + [hx, hy, hz][axis]);
    }
  };

  for (const part of [...ROBOT_PARTS, ...extraParts]) {
    include(
      part.node,
      part.position,
      [part.size[0] / 2, part.size[1] / 2, part.size[2] / 2],
      part.rotation,
    );
  }

  // Driven geometry, baked in its rest pose.
  for (const x of [-FACE.eyeOffsetX, FACE.eyeOffsetX]) {
    include('head', [
      FACE.eyeGroup.position[0] + x,
      FACE.eyeGroup.position[1],
      FACE.eyeGroup.position[2],
    ], [FACE.pupil.size[0] / 2, FACE.pupil.size[1] / 2, FACE.pupil.size[2] / 2]);
  }
  include('head', FACE.mouth.position, [
    FACE.mouth.size[0] / 2,
    FACE.mouth.size[1] / 2,
    FACE.mouth.size[2] / 2,
  ]);
  for (const x of [-FACE.blush.position[0], FACE.blush.position[0]]) {
    include('head', [x, FACE.blush.position[1], FACE.blush.position[2]], [
      FACE.blush.size[0] / 2,
      FACE.blush.size[1] / 2,
      FACE.blush.size[2] / 2,
    ]);
  }
  for (const arm of ['armL', 'armR'] as const) {
    include(arm, HANDS.position, [
      HANDS.size[0] / 2,
      HANDS.size[1] / 2,
      HANDS.size[2] / 2,
    ]);
  }
  include('antenna', ANTENNA_BALL.position, [
    ANTENNA_BALL.radius,
    ANTENNA_BALL.radius,
    ANTENNA_BALL.radius,
  ]);

  return { min, max, height: max[1] - min[1] };
}

/** Rest-pose height of the procedural robot, in metres. */
export const ROBOT_HEIGHT = robotBounds().height;

/**
 * Union of two bounds. Local to the module because `robotModel.ts` must stay
 * import-free (Node loads it directly with type-stripping).
 */
function unionBounds(a: RobotBounds, b: RobotBounds): RobotBounds {
  const min: [number, number, number] = [
    Math.min(a.min[0], b.min[0]),
    Math.min(a.min[1], b.min[1]),
    Math.min(a.min[2], b.min[2]),
  ];
  const max: [number, number, number] = [
    Math.max(a.max[0], b.max[0]),
    Math.max(a.max[1], b.max[1]),
    Math.max(a.max[2], b.max[2]),
  ];
  return { min, max, height: max[1] - min[1] };
}

/**
 * The tallest a bot can ever be: the neutral body unioned with every shell,
 * topper and emblem in the three tables.
 *
 * Deliberately computed from the *shape tables*, not from `IDENTITIES`: this
 * module cannot import `providerIdentity.ts` (it has no runtime imports at all,
 * see the header), and deriving it from shapes is the more correct definition —
 * a provider added later inherits the envelope automatically.
 *
 * Used only to place UI above the robot (the name pill). It must never feed
 * `ROBOT_HEIGHT`, which sizes the neutral `.glb`.
 */
export function identityBounds(): RobotBounds {
  const identityParts = [
    ...Object.values(SHELLS),
    ...Object.values(TOPPERS),
    ...Object.values(EMBLEMS),
  ].flat();
  return unionBounds(robotBounds(), robotBounds(identityParts));
}

/** Highest point any identity reaches, in root space (metres). */
export const ROBOT_ENVELOPE_TOP = identityBounds().max[1];

/** Full height of that envelope, in metres. */
export const ROBOT_ENVELOPE_HEIGHT = identityBounds().height;
