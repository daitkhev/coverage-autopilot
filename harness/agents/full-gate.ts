import { spawnSync } from 'node:child_process';
import { closeSync, mkdirSync, openSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { gateEnvironment, isInsideGate } from '#harness/gate/host';
import { HarnessError } from '#harness/shared/harness.error';

/** The profile an agent is held to before it may say it is done. */
export const DONE_PROFILE = 'full';

const GATE = 'harness/bin/check.ts';

/** Where the output of the run is kept. Git ignores the folder. */
const OUTPUT = 'reports/gate/output.log';

/** What a gate that was asked for inside a gate says, without a run. */
const NESTED =
  'A gate does not start a gate: this process was started by a run of ' +
  'the gate, so a hook that asks for the gate again is refused.';

/** One run of the gate: its verdict and everything it printed. */
export interface GateRun {
  readonly passed: boolean;
  readonly output: string;
}

/**
 * Runs the full gate on a tree. Both streams of the gate and of its tools
 * go to one file, so the output is read in the order it was printed.
 *
 * A test of the gate may start git, git may start a hook, and the hook
 * asks for the gate. Without a stop that is a loop of processes with no
 * end, so a gate inside a gate is a fault, and no verdict comes of it.
 */
export function runFullGate(root: string): GateRun {
  if (isInsideGate()) {
    throw new HarnessError(NESTED);
  }
  const log = join(root, OUTPUT);
  mkdirSync(dirname(log), { recursive: true });
  const file = openSync(log, 'w');
  try {
    const result = spawnSync(process.execPath, [GATE, DONE_PROFILE], {
      cwd: root,
      env: gateEnvironment(),
      stdio: ['ignore', file, file],
    });
    return { passed: result.status === 0, output: readFileSync(log, 'utf8') };
  } finally {
    closeSync(file);
  }
}
