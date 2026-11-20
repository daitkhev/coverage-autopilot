import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { formatFinding } from '#harness/architecture/finding';
import { runRatchet } from '#harness/architecture/run';
import { REPOSITORY_ROOT } from '#harness/shared/policy';

const { values } = parseArgs({ options: { root: { type: 'string' } } });
const root = resolve(values.root ?? REPOSITORY_ROOT);
const findings = runRatchet(root);

for (const finding of findings) {
  process.stdout.write(`${formatFinding(finding)}\n`);
}
process.stdout.write(
  findings.length === 0
    ? 'ratchet: no finding\n'
    : `ratchet: ${String(findings.length)} finding(s)\n`,
);
process.exitCode = findings.length === 0 ? 0 : 1;
