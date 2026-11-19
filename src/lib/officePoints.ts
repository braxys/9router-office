/**
 * Office Point of Interest (POI) registry and coordinate transformations.
 *
 * POIs are defined in office world space and mapped into each desk slot's
 * local coordinates for robot locomotion.
 */

export interface OfficePOI {
  readonly id: string;
  readonly label: string;
  /** Position in office world coordinates [x, y, z]. */
  readonly worldPos: readonly [number, number, number];
  /** Position to face while observing [x, y, z]. */
  readonly lookAtPos: readonly [number, number, number];
  /** Activity to perform at the POI. */
  readonly activity: 'inspect' | 'dance';
  /** How long to stay at this POI (seconds). */
  readonly durationS: number;
}

export const OFFICE_POIS: readonly OfficePOI[] = [
  {
    id: 'whiteboard',
    label: 'Whiteboard',
    worldPos: [-0.9, 0, -7.5],
    lookAtPos: [-0.9, 2.15, -9.0],
    activity: 'inspect',
    durationS: 5,
  },
  {
    id: 'west-bookshelf',
    label: 'Bookshelf West',
    worldPos: [-7.2, 0, 2.0],
    lookAtPos: [-9.0, 1.5, 2.0],
    activity: 'inspect',
    durationS: 4.5,
  },
  {
    id: 'south-monstera',
    label: 'Monstera Plant',
    worldPos: [-5.0, 0, 4.8],
    lookAtPos: [-6.4, 1.2, 6.0],
    activity: 'inspect',
    durationS: 4,
  },
  {
    id: 'south-cactus',
    label: 'Corner Cactus',
    worldPos: [5.0, 0, 4.8],
    lookAtPos: [6.6, 1.2, 5.9],
    activity: 'inspect',
    durationS: 4,
  },
  {
    id: 'hub-north',
    label: 'Central Hub Carpet',
    worldPos: [0.0, 0, -2.5],
    lookAtPos: [0.0, 1.0, 0.0],
    activity: 'dance',
    durationS: 6,
  },
  {
    id: 'hub-south',
    label: 'Central Hub South',
    worldPos: [0.0, 0, 2.5],
    lookAtPos: [0.0, 1.0, 0.0],
    activity: 'dance',
    durationS: 6,
  },
  {
    id: 'hub-west',
    label: 'Central Hub West',
    worldPos: [-2.5, 0, 0.0],
    lookAtPos: [0.0, 1.0, 0.0],
    activity: 'inspect',
    durationS: 4.5,
  },
];

/**
 * Transforms world coordinates [x, y, z] into local workstation coordinates
 * relative to the slot group.
 */
export function worldToSlotLocal(
  worldPos: readonly [number, number, number],
  slotPos: readonly [number, number, number],
  slotRotY: number,
): [number, number, number] {
  const dx = worldPos[0] - slotPos[0];
  const dy = worldPos[1] - slotPos[1];
  const dz = worldPos[2] - slotPos[2];

  const cos = Math.cos(-slotRotY);
  const sin = Math.sin(-slotRotY);

  const localX = dx * cos + dz * sin;
  const localY = dy;
  const localZ = -dx * sin + dz * cos;

  return [localX, localY, localZ];
}

/**
 * Transforms local workstation coordinates [x, y, z] back into world space.
 */
export function slotLocalToWorld(
  localPos: readonly [number, number, number],
  slotPos: readonly [number, number, number],
  slotRotY: number,
): [number, number, number] {
  const cos = Math.cos(slotRotY);
  const sin = Math.sin(slotRotY);

  const worldDx = localPos[0] * cos + localPos[2] * sin;
  const worldDy = localPos[1];
  const worldDz = -localPos[0] * sin + localPos[2] * cos;

  return [worldDx + slotPos[0], worldDy + slotPos[1], worldDz + slotPos[2]];
}

/**
 * Picks the next POI different from currentId.
 */
export function pickNextPoi(currentId: string | null, seed: number): OfficePOI {
  const candidates = currentId
    ? OFFICE_POIS.filter((p) => p.id !== currentId)
    : OFFICE_POIS;
  const index = Math.abs(seed) % candidates.length;
  return candidates[index];
}
