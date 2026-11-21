import { areasOf, TEST_KINDS, testFolders } from '#harness/gate/areas';
import type { NodeCommand } from '#harness/gate/host';
import { RUNNERS_CONFIG, TESTS_CONFIG, TOOLS } from '#harness/gate/tools';
import { HarnessError } from '#harness/shared/harness.error';
import { readStructure } from '#harness/shared/structure';

/** One check of the gate: a name, and the program that Node runs for it. */
export interface Step extends NodeCommand {
  readonly name: string;
}

/** A test that has no kept frame fails. The gate never writes one. */
const NO_NEW_SNAPSHOT = '--update=none';

/** What a tree is compared with on a desk: the commit it stands on. */
const LOCAL_BASE = 'HEAD';

function tool(name: string, script: string, ...rest: string[]): Step {
  return { name, nodeOptions: [], script, arguments: rest };
}

const AREAS = areasOf(readStructure());

/** The tests of one kind, of the harness and of every workspace. */
function tests(kind: (typeof TEST_KINDS)[number]): Step {
  return {
    name: kind,
    nodeOptions: [],
    script: TOOLS.vitest,
    arguments: [
      'run',
      '--config',
      TESTS_CONFIG,
      NO_NEW_SNAPSHOT,
      ...testFolders(AREAS, kind),
    ],
  };
}

/**
 * Every step, in the order the gate runs them. Each tool gets the path of
 * its configuration here, so none of them goes looking for one.
 */
export const STEPS: readonly Step[] = [
  tool(
    'format',
    TOOLS.prettier,
    '--check',
    '.',
    '--config',
    'prettier.config.mjs',
    '--ignore-path',
    '.prettierignore',
  ),
  tool(
    'lint',
    TOOLS.eslint,
    '.',
    '--config',
    'eslint.config.mjs',
    '--max-warnings',
    '0',
  ),
  tool('types', 'harness/bin/types.ts'),
  tool('architecture', 'harness/bin/ratchet.ts'),
  tool('compare', 'harness/bin/ratchet.ts', '--compare', LOCAL_BASE),
  tool(
    'unused',
    TOOLS.knip,
    '--config',
    'harness/configs/knip.json',
    '--exclude',
    'subpaths',
    '--no-progress',
    '--no-config-hints',
  ),
  tool('duplication', 'harness/bin/duplication.ts'),
  ...TEST_KINDS.map(tests),
  tool('coverage', 'harness/bin/coverage.ts'),
  tool('documents', 'harness/bin/documents.ts'),
  tool('secrets', 'harness/bin/secrets.ts'),
  tool('workflows', 'harness/bin/workflows.ts'),
  {
    name: 'runners',
    nodeOptions: [],
    script: TOOLS.vitest,
    arguments: ['run', '--config', RUNNERS_CONFIG, NO_NEW_SNAPSHOT],
  },
  tool('mutation', 'harness/bin/mutation.ts'),
];

const FAST = ['format', 'lint', 'types', 'architecture'];
const FULL = [
  ...FAST,
  'compare',
  'unused',
  'duplication',
  'unit',
  'integration',
  'coverage',
  'documents',
  'secrets',
];

/** The profiles of the gate. Each one holds the one before it. */
export const PROFILES: Readonly<Record<string, readonly string[]>> = {
  fast: FAST,
  full: FULL,
  ci: [...FULL, 'workflows', 'runners', 'mutation'],
};

function stepNamed(name: string): Step {
  const step = STEPS.find((candidate) => candidate.name === name);
  if (step === undefined) {
    const known = [...Object.keys(PROFILES), ...STEPS.map((s) => s.name)];
    throw new HarnessError(
      `"${name}" is not a profile or a step. Known: ${known.join(', ')}.`,
    );
  }
  return step;
}

/** The steps behind a name, which is a profile or one step. */
export function planFor(name: string): Step[] {
  const profile = Object.hasOwn(PROFILES, name) ? PROFILES[name] : undefined;
  return (profile ?? [name]).map(stepNamed);
}
