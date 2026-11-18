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
 * `body`, `limb` and `accent` are per-agent: they resolve from the agent's
 * `accentColor` at runtime. `limb` is that colour darkened, exactly as the
 * original hand-written rig computed it.
 */
export type PaletteKey =
  | 'body'
  | 'limb'
  | 'accent'
  | 'cream'
  | 'ink'
  | 'blush'
  | 'pink'
  | 'pinkDeep'
  | 'metal'
  | 'white'
  | 'yellow';

export const ROBOT_COLORS: Record<Exclude<PaletteKey, 'body' | 'limb' | 'accent'>, string> = {
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
 */
export function resolveRobotColor(key: PaletteKey, accent: string): string {
  switch (key) {
    case 'body':
    case 'accent':
      return accent;
    case 'limb':
      return darkenHex(accent, LIMB_DARKEN);
    default:
      return ROBOT_COLORS[key];
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
  color: PaletteKey;
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
 * Axis-aligned bounds of the whole robot in root space.
 *
 * Used to normalise a hand-made `.glb` to the procedural robot's height, and
 * cross-checked against three's own `Box3` by the generator — if the two ever
 * disagree the build fails.
 */
export function robotBounds(): RobotBounds {
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

  for (const part of ROBOT_PARTS) {
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
