import { readFileSync } from 'node:fs';

import { beforePush } from '#harness/agents/before-push';
import { runFullGate } from '#harness/agents/full-gate';
import { isAncestor } from '#harness/architecture/git';
import { processHost } from '#harness/gate/host';

const STANDARD_INPUT = 0;

process.exitCode = beforePush(
  readFileSync(STANDARD_INPUT, 'utf8'),
  processHost,
  {
    isAncestor: (older, newer) => isAncestor(processHost.root, older, newer),
    judge: runFullGate,
  },
);
