import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';

import { planFor, type Step } from '#harness/gate/steps';
import { HarnessError } from '#harness/shared/harness.error';
import { REPOSITORY_ROOT } from '#harness/shared/policy';

const DEFAULT_PROFILE = 'fast';

/** Runs one step and says whether it passed. A step that did not run failed. */
function passes(step: Step): boolean {
  process.stdout.write(`\n== ${step.name}\n`);
  const result = spawnSync(
    process.execPath,
    [...step.nodeOptions, step.script, ...step.arguments],
    { cwd: REPOSITORY_ROOT, stdio: 'inherit' },
  );
  return result.status === 0;
}

function main(): number {
  const { positionals } = parseArgs({ allowPositionals: true });
  const name = positionals[0] ?? DEFAULT_PROFILE;
  const failed = planFor(name).find((step) => !passes(step));
  if (failed !== undefined) {
    process.stdout.write(`\ncheck ${name}: failed at ${failed.name}\n`);
    return 1;
  }
  process.stdout.write(`\ncheck ${name}: passed\n`);
  return 0;
}

try {
  process.exitCode = main();
} catch (error) {
  if (!(error instanceof HarnessError)) {
    throw error;
  }
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
