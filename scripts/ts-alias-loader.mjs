/**
 * Module resolution hooks so Node can import the app's own TypeScript modules.
 *
 * The rule tests (`status:test`, `transport:test`, …) run the shipping code
 * directly under Node's type stripping, but two things block that for anything
 * importing the Zustand store:
 *
 *   1. `@/…` is a TypeScript path alias, which only the bundler knows about.
 *   2. Relative imports in `src/` are extensionless (`./types`), which the ESM
 *      resolver rejects.
 *
 * Both are resolved here, so a test can import `src/store/useAgentStore.ts` and
 * assert on the real wiring — which is where the pause and decay bugs actually
 * lived. A test that only re-implements the rules would have missed them.
 *
 *   node --import ./scripts/ts-alias-hooks.mjs …
 */
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcRoot = path.join(projectRoot, 'src');
/** Extensions to try when an import omits one, in resolution order. */
const EXTENSIONS = ['.ts', '.tsx', '.mjs', '.js'];

/** Resolve `@/x` to `src/x`, adding an extension when it is missing. */
function resolveAlias(specifier) {
  if (!specifier.startsWith('@/')) return null;
  const base = path.join(srcRoot, specifier.slice(2));
  if (existsSync(base) && path.extname(base)) return base;
  for (const ext of EXTENSIONS) {
    if (existsSync(base + ext)) return base + ext;
  }
  // A directory import such as `@/lib` resolves through its index file.
  for (const ext of EXTENSIONS) {
    const indexPath = path.join(base, `index${ext}`);
    if (existsSync(indexPath)) return indexPath;
  }
  return null;
}

/** Add an extension to an extensionless relative import that points into `src/`. */
function resolveRelative(specifier, parentURL) {
  if (!specifier.startsWith('.')) return null;
  const parentPath = fileURLToPath(parentURL);
  const base = path.resolve(path.dirname(parentPath), specifier);
  if (existsSync(base) && path.extname(base)) return base;
  for (const ext of EXTENSIONS) {
    if (existsSync(base + ext)) return base + ext;
  }
  for (const ext of EXTENSIONS) {
    const indexPath = path.join(base, `index${ext}`);
    if (existsSync(indexPath)) return indexPath;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  const aliased = resolveAlias(specifier);
  if (aliased) return { url: pathToFileURL(aliased).href, shortCircuit: true };

  const relative = context.parentURL ? resolveRelative(specifier, context.parentURL) : null;
  if (relative) return { url: pathToFileURL(relative).href, shortCircuit: true };

  return nextResolve(specifier, context);
}
