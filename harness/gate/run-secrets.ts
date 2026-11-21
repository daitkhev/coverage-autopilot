import { join } from 'node:path';

import { isShallow } from '#harness/architecture/git';
import { exitCodeOf } from '#harness/gate/exit-code';
import type { Host } from '#harness/gate/host';
import type { ProgramOf } from '#harness/gate/outside-program';
import { withCopyOfTree } from '#harness/gate/tree-copy';
import { HarnessError } from '#harness/shared/harness.error';
import { HARNESS_ROOT } from '#harness/shared/policy';

const CONFIGS = join(HARNESS_ROOT, 'configs');

/**
 * What both searches are started with. The rules and the list of accepted
 * findings come from the harness, never from the tree that is searched,
 * and a comment in a file accepts nothing.
 */
const COMMON = [
  '--no-banner',
  '--no-color',
  '--redact',
  '--verbose',
  '--config',
  join(CONFIGS, 'gitleaks.toml'),
  '--gitleaks-ignore-path',
  CONFIGS,
  '--ignore-gitleaks-allow',
];

/** The commits the tree stands on, and not every branch of the clone. */
const HISTORY = '--log-opts=HEAD';

/**
 * Searches for something that looks like a credential: in every commit
 * the tree stands on, where a removed secret still is, and in the files
 * git sees now, where an uncommitted one is.
 */
export function runSecrets(host: Host, programOf: ProgramOf): number {
  return exitCodeOf(host, () => {
    if (isShallow(host.root)) {
      throw new HarnessError(
        'secrets: this clone has a part of the history only, ' +
          'so the history cannot be searched.',
      );
    }
    const gitleaks = programOf('gitleaks');
    const history = host.run(gitleaks, ['git', ...COMMON, HISTORY, host.root]);
    const tree = withCopyOfTree(host.root, (copy) =>
      host.run(gitleaks, ['dir', ...COMMON, copy]),
    );
    return history && tree ? 0 : 1;
  });
}
