import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import {
  checkTree,
  compareWithBase,
  type Outcome,
  writeBaseline,
} from '#harness/architecture/commands';
import { formatFinding } from '#harness/architecture/finding';
import { exitCodeOf } from '#harness/gate/exit-code';
import type { Host } from '#harness/gate/host';

function outcomeOf(args: readonly string[], host: Host): Outcome {
  const { values } = parseArgs({
    args: [...args],
    options: {
      root: { type: 'string' },
      write: { type: 'boolean' },
      compare: { type: 'string' },
    },
  });
  const root = resolve(values.root ?? host.root);
  if (values.compare !== undefined) {
    return compareWithBase(root, values.compare);
  }
  return values.write === true ? writeBaseline(root) : checkTree(root);
}

function report(outcome: Outcome, host: Host): number {
  for (const finding of outcome.findings) {
    host.print(formatFinding(finding));
  }
  for (const note of outcome.notes) {
    host.print(`ratchet: ${note}`);
  }
  const count = outcome.findings.length;
  host.print(
    count === 0
      ? 'ratchet: no finding'
      : `ratchet: ${String(count)} finding(s)`,
  );
  return count === 0 ? 0 : 1;
}

/** The ratchet as a command: check by default, `--write`, `--compare`. */
export function runRatchetCommand(args: readonly string[], host: Host): number {
  return exitCodeOf(host, () => report(outcomeOf(args, host), host));
}
