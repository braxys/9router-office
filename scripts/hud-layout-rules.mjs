/**
 * Truth table for the HUD geometry contract.
 *
 * Imports `src/lib/hudLayout.ts` directly (Node 24 strips types), so the camera
 * framing and the layout panel cannot drift apart without a red gate.
 *
 *   npm run layout:unit
 */
import {
  LG_BREAKPOINT,
  PANEL_FOOTPRINT,
  PANEL_GUTTER,
  PANEL_RAIL_FOOTPRINT,
  PANEL_RAIL_WIDTH,
  PANEL_WIDTH,
  visibleSceneWidth,
} from '../src/lib/hudLayout.ts';

let failures = 0;
let total = 0;

function check(label, actual, expected) {
  total += 1;
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) failures += 1;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`);
  if (!pass) {
    console.log(`      expected: ${JSON.stringify(expected)}`);
    console.log(`      actual  : ${JSON.stringify(actual)}`);
  }
}

console.log('\n--- panel geometry ---\n');

check('panel width', PANEL_WIDTH, 320);
check('panel gutter', PANEL_GUTTER, 12);
check('panel footprint', PANEL_FOOTPRINT, 344);
check('rail width', PANEL_RAIL_WIDTH, 56);
check('rail footprint', PANEL_RAIL_FOOTPRINT, 80);

console.log('\n--- visible scene width ---\n');

check('expanded by default', visibleSceneWidth(1600), 1600 - PANEL_FOOTPRINT);
check('expanded explicitly', visibleSceneWidth(1600, false), 1600 - PANEL_FOOTPRINT);
check('collapsed gives the panel back', visibleSceneWidth(1600, true), 1600 - PANEL_RAIL_FOOTPRINT);
check('exactly lg, expanded', visibleSceneWidth(LG_BREAKPOINT), LG_BREAKPOINT - PANEL_FOOTPRINT);
check('exactly lg, collapsed', visibleSceneWidth(LG_BREAKPOINT, true), LG_BREAKPOINT - PANEL_RAIL_FOOTPRINT);
check('below lg ignores the panel', visibleSceneWidth(LG_BREAKPOINT - 1), LG_BREAKPOINT - 1);
check('below lg ignores the rail too', visibleSceneWidth(LG_BREAKPOINT - 1, true), LG_BREAKPOINT - 1);
check('a tiny viewport is below lg, so nothing is occluded', visibleSceneWidth(60), 60);
check('a tiny viewport stays unoccluded while collapsed', visibleSceneWidth(60, true), 60);
check('zero passes through', visibleSceneWidth(0), 0);
check('NaN passes through', Number.isNaN(visibleSceneWidth(NaN)), true);

if (failures > 0) {
  console.error(`\n${failures}/${total} failed`);
  process.exit(1);
}
console.log(`\n${total}/${total} passed`);
