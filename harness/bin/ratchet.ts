import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import {
  checkTree,
  compareWithBase,
  type Outcome,
  writeBaseline,
} from '#harness/architecture/commands';
import { formatFinding } from '#harness/architecture/finding';
import { HarnessError } from '#harness/shared/harness.error';
import { REPOSITORY_ROOT } from '#harness/shared/policy';

function run(): Outcome {
  const { values } = parseArgs({
    options: {
      root: { type: 'string' },
      write: { type: 'boolean' },
      compare: { type: 'string' },
    },
  });
  const root = resolve(values.root ?? REPOSITORY_ROOT);
  if (values.compare !== undefined) {
    return compareWithBase(root, values.compare);
  }
  return values.write === true ? writeBaseline(root) : checkTree(root);
}

function report(outcome: Outcome): number {
  for (const finding of outcome.findings) {
    process.stdout.write(`${formatFinding(finding)}\n`);
  }
  for (const note of outcome.notes) {
    process.stdout.write(`ratchet: ${note}\n`);
  }
  const count = outcome.findings.length;
  process.stdout.write(
    count === 0
      ? 'ratchet: no finding\n'
      : `ratchet: ${String(count)} finding(s)\n`,
  );
  return count === 0 ? 0 : 1;
}

try {
  process.exitCode = report(run());
} catch (error) {
  if (!(error instanceof HarnessError)) {
    throw error;
  }
  process.stderr.write(`ratchet: ${error.message}\n`);
  process.exitCode = 1;
}
