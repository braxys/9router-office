/**
 * Geometry contract shared by the HUD layout and the 3D camera framing.
 *
 * The simulation panel floats *over* a full-bleed scene, so the canvas is
 * always as wide as the viewport but only `viewport - PANEL_FOOTPRINT` of it is
 * actually visible at `lg` and up. Collapsing the panel leaves a narrow rail,
 * so the visible width becomes `viewport - PANEL_RAIL_FOOTPRINT` instead. The
 * camera has to be framed against the visible box, not the canvas box, or the
 * office drifts under the panel.
 *
 * These numbers are load-bearing: `scripts/layout-check.mjs` asserts the panel
 * renders at exactly 320px, so a drift here would silently re-crop the scene.
 * The gate keeps its own literal on purpose — an independent oracle catches a
 * change to `PANEL_WIDTH` instead of agreeing with it.
 */

/** Tailwind `lg`: from here up the panel takes over from the dock. */
export const LG_BREAKPOINT = 1024;

/** The panel's own width, applied by `SimulationPanel` as an inline style. */
export const PANEL_WIDTH = 320;

/** Padding on each side of the panel's wrapper (`p-3`). */
export const PANEL_GUTTER = 12;

/** Total horizontal space the panel occupies: 320 + 12 + 12 = 344px. */
export const PANEL_FOOTPRINT = PANEL_WIDTH + PANEL_GUTTER * 2;

/** The rail left behind when the panel is collapsed: one 40px logo + padding. */
export const PANEL_RAIL_WIDTH = 56;

/** Total horizontal space the collapsed rail occupies: 56 + 12 + 12 = 80px. */
export const PANEL_RAIL_FOOTPRINT = PANEL_RAIL_WIDTH + PANEL_GUTTER * 2;

/**
 * How much of a full-bleed canvas is actually visible at this width.
 *
 * Below `lg` the controls live in the bottom dock instead, so nothing is
 * occluded horizontally and the whole canvas is visible. `collapsed` swaps the
 * panel footprint for the rail's, so the camera gives the office back the space
 * the fold releases.
 */
export function visibleSceneWidth(canvasWidth: number, collapsed = false): number {
  if (!Number.isFinite(canvasWidth) || canvasWidth <= 0) return canvasWidth;
  if (canvasWidth < LG_BREAKPOINT) return canvasWidth;
  const footprint = collapsed ? PANEL_RAIL_FOOTPRINT : PANEL_FOOTPRINT;
  // A viewport narrower than the panel itself would leave no scene; clamp to
  // zero and let the callers fall back to the design framing.
  return Math.max(0, canvasWidth - footprint);
}
