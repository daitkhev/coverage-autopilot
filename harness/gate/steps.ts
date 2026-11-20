import { HarnessError } from '#harness/shared/harness.error';

/** One check of the gate: a program that Node runs, and its arguments. */
export interface Step {
  readonly name: string;
  /** Options for Node itself, before the script. */
  readonly nodeOptions: readonly string[];
  /** The script, from the root of the repository. */
  readonly script: string;
  readonly arguments: readonly string[];
}

const JEST_NODE_OPTIONS = [
  '--experimental-vm-modules',
  '--disable-warning=ExperimentalWarning',
];

/** What a tree is compared with on a desk: the commit it stands on. */
const LOCAL_BASE = 'HEAD';

function tool(name: string, script: string, ...rest: string[]): Step {
  return { name, nodeOptions: [], script, arguments: rest };
}

function tests(name: string, folder: string): Step {
  return {
    name,
    nodeOptions: JEST_NODE_OPTIONS,
    script: 'node_modules/jest/bin/jest.js',
    arguments: ['--config', 'harness/configs/jest.json', '--ci', folder],
  };
}

/**
 * Every step, in the order the gate runs them. Each tool gets the path of
 * its configuration here, so none of them goes looking for one.
 */
export const STEPS: readonly Step[] = [
  tool(
    'format',
    'node_modules/prettier/bin/prettier.cjs',
    '--check',
    '.',
    '--config',
    'prettier.config.mjs',
    '--ignore-path',
    '.prettierignore',
  ),
  tool(
    'lint',
    'node_modules/eslint/bin/eslint.js',
    '.',
    '--config',
    'eslint.config.mjs',
    '--max-warnings',
    '0',
  ),
  tool('types', 'harness/bin/types.ts'),
  tool('architecture', 'harness/bin/ratchet.ts'),
  tool('compare', 'harness/bin/ratchet.ts', '--compare', LOCAL_BASE),
  tests('unit', 'harness/tests/unit'),
  tests('integration', 'harness/tests/integration'),
];

const FAST = ['format', 'lint', 'types', 'architecture'];

/** The profiles of the gate. Each one holds the one before it. */
export const PROFILES: Readonly<Record<string, readonly string[]>> = {
  fast: FAST,
  full: [...FAST, 'compare', 'unit', 'integration'],
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
