import { readFileSync } from 'node:fs';

import { beforeCommand } from '#harness/agents/before-command';
import { currentBranch } from '#harness/architecture/git';
import { REPOSITORY_ROOT } from '#harness/shared/policy';

const STANDARD_INPUT = 0;

process.stdout.write(
  beforeCommand(
    readFileSync(STANDARD_INPUT, 'utf8'),
    REPOSITORY_ROOT,
    currentBranch,
  ),
);
