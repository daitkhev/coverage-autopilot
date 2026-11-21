import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { listFiles } from '#harness/architecture/files';
import {
  type Area,
  areasOf,
  TEST_KINDS,
  testFolders,
} from '#harness/gate/areas';
import {
  hasRuntimeCode,
  leftOutOf,
  measuredFiles,
} from '#harness/gate/coverage-files';
import { exitCodeOf } from '#harness/gate/exit-code';
import type { Host, NodeCommand } from '#harness/gate/host';
import { TESTS_CONFIG, TOOLS } from '#harness/gate/tools';
import { HarnessError } from '#harness/shared/harness.error';
import { readJsonRecord } from '#harness/shared/json';
import { type CoverageFloors, readLimits } from '#harness/shared/policy';
import { readStructure, type Structure } from '#harness/shared/structure';

/** Where Vitest writes the report of an area, from the root of the tree. */
export function coverageReport(area: Area): string {
  return `${reportFolder(area)}/coverage-final.json`;
}

function reportFolder(area: Area): string {
  return `coverage/${area.name}`;
}

function floorsOf(floors: CoverageFloors): string[] {
  return Object.entries(floors).map(
    ([counter, floor]) => `--coverage.thresholds.${counter}=${String(floor)}`,
  );
}

/** What Vitest counts: the source of the area, by its extensions. */
function countedOf(area: Area, structure: Structure): string[] {
  const kinds = structure.extensions.map((extension) => extension.slice(1));
  return [
    `--coverage.include=${area.source}**/*.{${kinds.join(',')}}`,
    ...leftOutOf(area, structure).map(
      (prefix) => `--coverage.exclude=${prefix}**`,
    ),
  ];
}

/**
 * Vitest over the tests of one area, with the floors of the policy. Both
 * kinds of tests count: the unit tests alone do not touch a disk.
 */
export function coverageCommand(
  area: Area,
  floors: CoverageFloors,
  structure: Structure,
): NodeCommand {
  return {
    nodeOptions: [],
    script: TOOLS.vitest,
    arguments: [
      'run',
      '--config',
      TESTS_CONFIG,
      '--coverage.enabled',
      ...countedOf(area, structure),
      `--coverage.reportsDirectory=${reportFolder(area)}`,
      ...floorsOf(floors),
      ...TEST_KINDS.flatMap((kind) => testFolders([area], kind)),
    ],
  };
}

function reportedFiles(root: string, area: Area): string[] {
  const report = coverageReport(area);
  if (!existsSync(join(root, report))) {
    throw new HarnessError(`coverage: ${report} was not written.`);
  }
  return Object.keys(readJsonRecord(join(root, report))).map((file) =>
    relative(root, file).split(sep).join('/'),
  );
}

/** The source files of an area that are there and run something. */
function runningFiles(root: string, area: Area, files: string[]): string[] {
  return measuredFiles(files, area, readStructure())
    .filter((path) => existsSync(join(root, path)))
    .filter((path) =>
      hasRuntimeCode(path, readFileSync(join(root, path), 'utf8')),
    );
}

/**
 * Measures one area and holds it at the floors. Then it checks that the
 * report has every source file, so a file no test imports is at zero and
 * a folder cannot be left out unseen.
 */
function measure(host: Host, area: Area, files: readonly string[]): boolean {
  rmSync(join(host.root, coverageReport(area)), { force: true });
  const command = coverageCommand(area, readLimits().coverage, readStructure());
  if (!host.start(command)) {
    return false;
  }
  const reported = new Set(reportedFiles(host.root, area));
  const missing = files.filter((path) => !reported.has(path));
  for (const path of missing) {
    host.print(`coverage: ${path} is not in the report.`);
  }
  host.print(
    missing.length === 0
      ? `coverage: ${area.name}: every source file is in the report`
      : `coverage: ${area.name}: ${String(missing.length)} file(s) left out`,
  );
  return missing.length === 0;
}

/**
 * Measures the coverage of every area that has source, one after another,
 * and stops at the first that fails. A workspace that holds nothing that
 * runs yet is named and is not measured.
 */
export function runCoverage(host: Host): number {
  return exitCodeOf(host, () => {
    const files = listFiles(host.root);
    for (const area of areasOf(readStructure())) {
      const running = runningFiles(host.root, area, files);
      if (running.length === 0) {
        host.print(`coverage: ${area.name} has no source yet`);
      } else if (!measure(host, area, running)) {
        return 1;
      }
    }
    return 0;
  });
}
