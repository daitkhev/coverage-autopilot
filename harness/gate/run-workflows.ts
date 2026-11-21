import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { listFiles } from '#harness/architecture/files';
import { exitCodeOf } from '#harness/gate/exit-code';
import type { Host } from '#harness/gate/host';
import type { ProgramOf } from '#harness/gate/outside-program';
import { HarnessError } from '#harness/shared/harness.error';
import { HARNESS_ROOT } from '#harness/shared/policy';

const GITHUB = '.github';
const WORKFLOW = /^\.github\/workflows\/[^/]+\.ya?ml$/;
const CONFIGS = join(HARNESS_ROOT, 'configs');

/**
 * actionlint with its two helpers off. They are other programs, and a
 * machine that has them would give another verdict than one that has not.
 */
const LINT = [
  '-shellcheck=',
  '-pyflakes=',
  '-no-color',
  '-config-file',
  join(CONFIGS, 'actionlint.yaml'),
];

/** zizmor at its strictest, asking nothing of the network. */
const AUDIT = [
  '--offline',
  '--no-progress',
  '--color',
  'never',
  '--pedantic',
  '--strict-collection',
  '--config',
  join(CONFIGS, 'zizmor.yml'),
];

/**
 * Holds the workflows of the tree: actionlint reads what each one says,
 * zizmor what it is allowed to do.
 */
export function runWorkflows(host: Host, programOf: ProgramOf): number {
  return exitCodeOf(host, () => {
    const workflows = listFiles(host.root)
      .filter((path) => WORKFLOW.test(path))
      .filter((path) => existsSync(join(host.root, path)))
      .map((path) => join(host.root, path));
    if (workflows.length === 0) {
      throw new HarnessError('workflows: the tree has no workflow to judge.');
    }
    const linted = host.run(programOf('actionlint'), [...LINT, ...workflows]);
    const audited = host.run(programOf('zizmor'), [
      ...AUDIT,
      join(host.root, GITHUB),
    ]);
    return linted && audited ? 0 : 1;
  });
}
