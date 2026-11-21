import { CoverageSnapshot } from '#coverage/domain/entities/coverage-snapshot.entity';
import { CoverageCounter } from '#coverage/domain/value-objects/coverage-counter.vo';
import {
  CoverageCounters,
  type CoverageMetric,
} from '#coverage/domain/value-objects/coverage-counters.vo';
import { DetectedProject } from '#coverage/domain/value-objects/detected-project.vo';
import { FileCoverage } from '#coverage/domain/value-objects/file-coverage.vo';
import { ScanParameters } from '#coverage/domain/value-objects/scan-parameters.vo';
import { SnapshotId } from '#coverage/domain/value-objects/snapshot-id.vo';
import { UncoveredCode } from '#coverage/domain/value-objects/uncovered-code.vo';
import type { UnmeasuredFile } from '#coverage/domain/value-objects/unmeasured-file.vo';
import { CommitSha } from '#kernel/primitives/commit-sha';
import { FilePath } from '#kernel/primitives/file-path';
import { RepositoryId } from '#kernel/primitives/repository-id';
import { Instant } from '#kernel/time/instant';

const SHA1_DIGITS = 40;

/** The commit every snapshot of a test is taken at. */
export const SNAPSHOT_COMMIT = 'c'.repeat(SHA1_DIGITS);

export const SNAPSHOT_ID = '00000000-0000-4000-8000-0000000000aa';

export const REPOSITORY_ID = '00000000-0000-4000-8000-0000000000bb';

export const CAPTURED_AT = '2026-03-04T05:06:07.008Z';

/** Covered and total of each metric a test names. The others are 0 of 0. */
export type CounterSpec = Partial<
  Record<CoverageMetric, readonly [number, number]>
>;

export function countersOf(spec: CounterSpec): CoverageCounters {
  const counter = (metric: CoverageMetric): CoverageCounter => {
    const [covered, total] = spec[metric] ?? [0, 0];
    return CoverageCounter.create({ covered, total });
  };
  return CoverageCounters.create({
    statements: counter('statements'),
    branches: counter('branches'),
    functions: counter('functions'),
    lines: counter('lines'),
  });
}

/** A measured file with nothing uncovered listed. */
export function measuredFile(path: string, spec: CounterSpec): FileCoverage {
  return FileCoverage.measured({
    path: FilePath.create(path),
    counters: countersOf(spec),
    uncovered: UncoveredCode.none(),
  });
}

export function jestProject(): DetectedProject {
  return DetectedProject.create({
    testRunner: 'jest',
    testRunnerVersion: '30.5.2',
    packageManager: 'npm',
    configFile: FilePath.create('jest.config.json'),
  });
}

export function jestParameters(): ScanParameters {
  return ScanParameters.create({
    testRunner: 'jest',
    testRunnerVersion: '30.5.2',
    coverageProvider: 'babel',
    fileListRule: 'default-sources-v1',
  });
}

export interface SnapshotSpec {
  readonly id?: string;
  readonly originKey?: string;
  readonly files?: readonly FileCoverage[];
  readonly unmeasured?: readonly UnmeasuredFile[];
}

/** A snapshot of `acme/widgets` with the files a test names. */
export function snapshotOf(spec: SnapshotSpec = {}): CoverageSnapshot {
  return CoverageSnapshot.create({
    id: SnapshotId.create(spec.id ?? SNAPSHOT_ID),
    repositoryId: RepositoryId.create(REPOSITORY_ID),
    commit: CommitSha.create(SNAPSHOT_COMMIT),
    originKey: spec.originKey ?? 'scan:origin',
    project: jestProject(),
    parameters: jestParameters(),
    files: spec.files ?? [],
    unmeasured: spec.unmeasured ?? [],
    testRunOutput: null,
    capturedAt: Instant.parse(CAPTURED_AT),
  });
}
