import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { listFiles } from '#harness/architecture/files';
import { hasRuntimeCode, measuredFiles } from '#harness/gate/coverage-files';
import { exitCodeOf } from '#harness/gate/exit-code';
import type { Host, NodeCommand } from '#harness/gate/host';
import { JEST_CONFIG, JEST_NODE_OPTIONS, TOOLS } from '#harness/gate/tools';
import { HarnessError } from '#harness/shared/harness.error';
import { readJsonRecord } from '#harness/shared/json';
import { type CoverageFloors, readLimits } from '#harness/shared/policy';
import { readStructure } from '#harness/shared/structure';

/** Where Jest writes the report, from the root of the tree. */
export const COVERAGE_REPORT = 'coverage/harness/coverage-final.json';

/** Both kinds of tests count: the unit tests alone do not touch a disk. */
const TESTS = ['harness/tests/unit', 'harness/tests/integration'];

/** Jest over all the tests of the harness, with the floors of the policy. */
export function coverageCommand(floors: CoverageFloors): NodeCommand {
  return {
    nodeOptions: JEST_NODE_OPTIONS,
    script: TOOLS.jest,
    arguments: [
      '--config',
      JEST_CONFIG,
      '--ci',
      '--coverage',
      '--coverageThreshold',
      JSON.stringify({ global: floors }),
      ...TESTS,
    ],
  };
}

function reportedFiles(root: string): string[] {
  const path = join(root, COVERAGE_REPORT);
  if (!existsSync(path)) {
    throw new HarnessError(`coverage: ${COVERAGE_REPORT} was not written.`);
  }
  return Object.keys(readJsonRecord(path)).map((file) =>
    relative(root, file).split(sep).join('/'),
  );
}

/** Source files that run something and that the report does not have. */
function missingFiles(root: string): string[] {
  const reported = new Set(reportedFiles(root));
  return measuredFiles(listFiles(root), readStructure())
    .filter((path) => !reported.has(path))
    .filter((path) => existsSync(join(root, path)))
    .filter((path) =>
      hasRuntimeCode(path, readFileSync(join(root, path), 'utf8')),
    );
}

/**
 * Measures coverage and holds it at the floors. Then it checks that the
 * report has every source file, so a file no test imports is at zero and
 * a folder cannot be left out unseen.
 */
export function runCoverage(host: Host): number {
  return exitCodeOf(host, () => {
    rmSync(join(host.root, COVERAGE_REPORT), { force: true });
    if (!host.start(coverageCommand(readLimits().coverage))) {
      return 1;
    }
    const missing = missingFiles(host.root);
    for (const path of missing) {
      host.print(`coverage: ${path} is not in the report.`);
    }
    host.print(
      missing.length === 0
        ? 'coverage: every source file is in the report'
        : `coverage: ${String(missing.length)} file(s) left out`,
    );
    return missing.length === 0 ? 0 : 1;
  });
}
