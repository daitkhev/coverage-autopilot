import { readFileSync } from 'node:fs';

import { beforeEdit } from '#harness/agents/before-edit';
import { commandArguments } from '#harness/gate/host';
import { REPOSITORY_ROOT } from '#harness/shared/policy';

const STANDARD_INPUT = 0;

process.stdout.write(
  beforeEdit(
    readFileSync(STANDARD_INPUT, 'utf8'),
    REPOSITORY_ROOT,
    commandArguments()[0],
  ),
);
