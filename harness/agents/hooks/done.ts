import { readFileSync } from 'node:fs';

import { treeToJudge } from '#harness/agents/done-tree';
import { runFullGate } from '#harness/agents/full-gate';
import { whenDone } from '#harness/agents/when-done';
import { REPOSITORY_ROOT } from '#harness/shared/policy';

const STANDARD_INPUT = 0;

const tree = treeToJudge(readFileSync(STANDARD_INPUT, 'utf8'), REPOSITORY_ROOT);

process.stdout.write(tree === undefined ? '' : whenDone(tree, runFullGate));
