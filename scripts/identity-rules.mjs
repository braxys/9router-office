/**
 * Truth table for the provider identity rules.
 *
 * Imports `src/lib/providerIdentity.ts` directly (Node 24 strips types), so this
 * exercises the shipping table rather than a re-implementation.
 *
 *   npm run identity:test
 */
import { IDENTITIES, resolveIdentity } from '../src/lib/providerIdentity.ts';

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

/* -------------------------------------------------------------------------- */
console.log('\n--- assertion 1: every identity id has an entry ---\n');

check(
  'every IdentityId has an entry',
  Object.keys(IDENTITIES).sort(),
  [
    'anthropic',
    'antigravity',
    'codebuddy',
    'codex',
    'default',
    'gemini',
    'kilocode',
    'nous',
    'nvidia',
    'ollama',
    'openai',
    'opencode',
    'openrouter',
  ],
);
check('unknown key falls back to default', resolveIdentity('apa-saja').id, 'default');
check('empty key falls back to default', resolveIdentity('').id, 'default');

/* -------------------------------------------------------------------------- */
console.log('\n--- assertion 2: live 9Router provider ids ---\n');

for (const [key, id] of [
  ['codebuddy-intl', 'codebuddy'],
  ['antigravity', 'antigravity'],
  ['codex', 'codex'],
  ['gemini', 'gemini'],
  ['kilocode', 'kilocode'],
  ['nvidia', 'nvidia'],
  ['nous', 'nous'],
  ['opencode', 'opencode'],
  ['openrouter', 'openrouter'],
]) {
  check(`live alias ${key} -> ${id}`, resolveIdentity(key).id, id);
}

/* -------------------------------------------------------------------------- */
console.log('\n--- assertion 3: simulation config ids ---\n');

for (const [key, id] of [
  ['gemini-2.5-pro', 'gemini'],
  ['claude-sonnet-4-5', 'anthropic'],
  ['gpt-5-1', 'openai'],
  ['llama-3-3-70b', 'ollama'],
]) {
  check(`simulation alias ${key} -> ${id}`, resolveIdentity(key).id, id);
}

/* -------------------------------------------------------------------------- */
console.log('\n--- assertion 7: one source of colour ---\n');

for (const id of Object.keys(IDENTITIES)) {
  if (id === 'default') continue;
  check(`colour ${id} === body`, resolveIdentity(id).color, IDENTITIES[id].body);
}

/* -------------------------------------------------------------------------- */
console.log('\n--- unknown providers: distinct, stable, never default-bodied ---\n');

// Two foreign providers must not become twins: the office would show two
// identical robots and the colour is the only thing telling them apart.
check(
  'two unknown providers get different colours',
  resolveIdentity('zzz-unknown').color !== resolveIdentity('qqq-unknown').color,
  true,
);
check(
  'the same unknown provider resolves to the same colour',
  resolveIdentity('zzz-unknown').color,
  resolveIdentity('zzz-unknown').color,
);
check(
  'an unknown provider keeps the default body shape',
  [resolveIdentity('zzz-unknown').shell, resolveIdentity('zzz-unknown').topper],
  ['box', 'ball'],
);
check(
  'an unknown provider keeps its raw key as the label',
  resolveIdentity('zzz-unknown').label,
  'zzz-unknown',
);

// Every colour must be a hex literal: `resolveRobotColor` treats a leading '#'
// as a literal, and anything else would be looked up as a palette key and come
// back undefined.
const hexish = /^#[0-9a-fA-F]{6}$/;
for (const id of Object.keys(IDENTITIES)) {
  check(`${id} colour is #rrggbb`, hexish.test(resolveIdentity(id).color), true);
}

/* -------------------------------------------------------------------------- */
console.log('\n--- aliases: normalised, unique, and non-empty for real identities ---\n');

const normalise = (key) => key.toLowerCase().replace(/[^a-z0-9]/g, '');

for (const [id, identity] of Object.entries(IDENTITIES)) {
  if (id === 'default') continue;
  check(`${id} declares at least one alias`, identity.aliases.length > 0, true);
  check(
    `${id} resolves from its own id`,
    resolveIdentity(id).id,
    id,
  );
}

// A duplicate alias means one identity is unreachable — the resolver returns
// whichever entry the table happens to list first.
const seen = new Map();
for (const [id, identity] of Object.entries(IDENTITIES)) {
  for (const alias of identity.aliases) {
    const key = normalise(alias);
    const owner = seen.get(key);
    if (owner && owner !== id) {
      check(`alias "${alias}" is claimed by ${owner} and ${id}`, owner, id);
    }
    seen.set(key, id);
  }
}
check('no alias is claimed twice', seen.size, [...seen.keys()].length);

/* -------------------------------------------------------------------------- */
console.log(`\n${total - failures}/${total} passed`);
if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('all provider identity rules behave as specified');
