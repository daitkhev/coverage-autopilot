import type { NodeCommand } from '#harness/gate/host';
import { JEST_CONFIG, JEST_NODE_OPTIONS, TOOLS } from '#harness/gate/tools';
import { HarnessError } from '#harness/shared/harness.error';
import { readLimits } from '#harness/shared/policy';

/** One check of the gate: a name, and the program that Node runs for it. */
export interface Step extends NodeCommand {
  readonly name: string;
}

/** What a tree is compared with on a desk: the commit it stands on. */
const LOCAL_BASE = 'HEAD';

function tool(name: string, script: string, ...rest: string[]): Step {
  return { name, nodeOptions: [], script, arguments: rest };
}

function tests(name: string, folder: string): Step {
  return {
    name,
    nodeOptions: JEST_NODE_OPTIONS,
    script: TOOLS.jest,
    arguments: ['--config', JEST_CONFIG, '--ci', folder],
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
  tool(
    'duplication',
    TOOLS.jscpd,
    '.',
    '--config',
    'harness/configs/jscpd.json',
    '--threshold',
    String(readLimits().duplicationPercent),
    '--fail-on-empty',
    '--no-colors',
  ),
  tests('unit', 'harness/tests/unit'),
  tests('integration', 'harness/tests/integration'),
  tool('coverage', 'harness/bin/coverage.ts'),
  tool('documents', 'harness/bin/documents.ts'),
];

const FAST = ['format', 'lint', 'types', 'architecture'];

/** The profiles of the gate. Each one holds the one before it. */
export const PROFILES: Readonly<Record<string, readonly string[]>> = {
  fast: FAST,
  full: [
    ...FAST,
    'compare',
    'unused',
    'duplication',
    'unit',
    'integration',
    'coverage',
    'documents',
  ],
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
