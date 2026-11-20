import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join, posix } from 'node:path';

import { listFiles } from '#harness/architecture/files';
import { hasRuntimeCode } from '#harness/gate/coverage-files';
import type { Host } from '#harness/gate/host';
import { TOOLS } from '#harness/gate/tools';
import { type MutationReport, reportOf } from '#harness/mutation/report';
import {
  describeResources,
  engineOptions,
  resourcesOf,
} from '#harness/mutation/resources';
import {
  type AreaResult,
  isInArea,
  resultOf,
  type Verdict,
  verdictOf,
} from '#harness/mutation/verdict';
import { HarnessError } from '#harness/shared/harness.error';
import { isRecord } from '#harness/shared/json';
import {
  type Area,
  type MutationRun,
  readMutationRuns,
} from '#harness/shared/mutation-policy';
import { readLimits } from '#harness/shared/policy';
import { readStructure } from '#harness/shared/structure';

/**
 * The files of an area the engine had to read: its source files that have
 * something to run. A file of types alone has nothing to mutate.
 */
function scopeOf(area: Area, root: string): string[] {
  const { extensions, excluded } = readStructure();
  return listFiles(root)
    .filter((path) => isInArea(path, area))
    .filter((path) => extensions.includes(posix.extname(path)))
    .filter((path) => !excluded.some((prefix) => path.startsWith(prefix)))
    .filter((path) => existsSync(join(root, path)))
    .filter((path) =>
      hasRuntimeCode(path, readFileSync(join(root, path), 'utf8')),
    );
}

function readReport(root: string, run: MutationRun): MutationReport {
  const path = join(root, run.report);
  if (!existsSync(path)) {
    throw new HarnessError(`${run.report} was not written.`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new HarnessError(`${run.report} is not JSON.`);
  }
  if (!isRecord(parsed)) {
    throw new HarnessError(`${run.report} must hold a JSON object.`);
  }
  return reportOf(parsed);
}

/**
 * Runs the engine and reads what it wrote. An old report is removed first,
 * so a run that was stopped leaves no report to trust. The machine says
 * how many test runners start and how much memory each may take.
 */
function measure(run: MutationRun, host: Host): MutationReport {
  rmSync(join(host.root, run.report), { force: true });
  const resources = resourcesOf(host);
  host.print(`mutation: ${run.name} runs with ${describeResources(resources)}`);
  const finished = host.start({
    nodeOptions: [],
    script: TOOLS['@stryker-mutator/core'],
    arguments: ['run', run.config, ...engineOptions(resources)],
  });
  if (!finished) {
    throw new HarnessError('The run of the engine did not finish.');
  }
  return readReport(host.root, run);
}

function resultsOf(run: MutationRun, host: Host): Map<string, AreaResult> {
  try {
    const report = measure(run, host);
    return new Map(
      run.areas.map((area) => [
        area.name,
        resultOf(area, report, scopeOf(area, host.root)),
      ]),
    );
  } catch (error) {
    if (!(error instanceof HarnessError)) {
      throw error;
    }
    const failed: AreaResult = { kind: 'not_measured', reason: error.message };
    return new Map(run.areas.map((area) => [area.name, failed]));
  }
}

function verdictsOf(run: MutationRun, host: Host): Verdict[] {
  const floors = readLimits().mutationFloors;
  return [...resultsOf(run, host)].map(([area, result]) =>
    verdictOf(area, result, floors.get(area)),
  );
}

/**
 * Runs the mutation tests and judges every area by its own floor. The
 * verdict comes from the report, never from the score the engine prints.
 */
export function runMutation(host: Host): number {
  const verdicts = readMutationRuns().flatMap((run) => verdictsOf(run, host));
  for (const verdict of verdicts) {
    const mark = verdict.passed ? 'passed' : 'failed';
    host.print(`mutation: ${verdict.area} ${mark}: ${verdict.detail}`);
  }
  return verdicts.every((verdict) => verdict.passed) ? 0 : 1;
}
