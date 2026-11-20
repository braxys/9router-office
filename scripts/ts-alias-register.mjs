/**
 * Registers `ts-alias-loader.mjs` so Node can import the app's own modules.
 *
 * `--import` only evaluates a module; the resolution hooks have to be installed
 * through `module.register()`, which is what this does. Tests then run with:
 *
 *   node --import ./scripts/ts-alias-register.mjs …
 *
 * Why this exists: the rule tests import pure modules and re-check the rules,
 * which is fine for predicates but cannot see the *wiring*. Both reported bugs
 * lived in the wiring (a pause flag that was really a source switch, and a decay
 * that compared two different clocks), so the store has to be importable to be
 * testable.
 */
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./ts-alias-loader.mjs', pathToFileURL(import.meta.filename));
