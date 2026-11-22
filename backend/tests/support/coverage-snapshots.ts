import {
  CoverageSnapshot,
  type TestCounts,
} from '#coverage/domain/entities/coverage-snapshot.entity';
import { CoverageCounter } from '#coverage/domain/value-objects/coverage-counter.vo';
import {
  CoverageCounters,
  type CoverageMetric,
} from '#coverage/domain/value-objects/coverage-counters.vo';
import { CoverageThreshold } from '#coverage/domain/value-objects/coverage-threshold.vo';
import { DetectedProject } from '#coverage/domain/value-objects/detected-project.vo';
import { FileCoverage } from '#coverage/domain/value-objects/file-coverage.vo';
import { ScanParameters } from '#coverage/domain/value-objects/scan-parameters.vo';
import { SnapshotId } from '#coverage/domain/value-objects/snapshot-id.vo';
import { UncoveredCode } from '#coverage/domain/value-objects/uncovered-code.vo';
import { UnmeasuredFile } from '#coverage/domain/value-objects/unmeasured-file.vo';
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

/** The default threshold of a test: 80% of lines, as a plain service has. */
export const DEFAULT_TEST_THRESHOLD = {
  metric: 'lines',
  percentage: 80,
} as const;

/** The default install of a test: sandboxed, as a plain service has. */
export const DEFAULT_TEST_INSTALL = { mode: 'sandboxed' } as const;

/** What a test judges files by when it names no other threshold. */
export const TEST_THRESHOLD = CoverageThreshold.create(DEFAULT_TEST_THRESHOLD);

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

/** The files of the fixture projects, one in each state a snapshot knows. */
export interface FixtureFiles {
  /** Imported by a test that calls one of its two functions. */
  readonly used: FileCoverage;
  /** Imported by no test, so listed at zero. */
  readonly unused: FileCoverage;
  /** Type declarations alone. */
  readonly types: FileCoverage;
  /** A syntax error. */
  readonly broken: UnmeasuredFile;
}

/** The line of the `if` in `halve` of `src/used.ts`. */
const OPEN_BRANCH_LINE = 6;

export function fixtureFiles(): FixtureFiles {
  return {
    used: FileCoverage.measured({
      path: FilePath.create('src/used.ts'),
      counters: CoverageCounters.create({
        statements: CoverageCounter.create({ covered: 2, total: 6 }),
        branches: CoverageCounter.create({ covered: 1, total: 2 }),
        functions: CoverageCounter.create({ covered: 1, total: 2 }),
        lines: CoverageCounter.create({ covered: 2, total: 5 }),
      }),
      uncovered: UncoveredCode.create({
        lines: [{ start: 6, end: 9 }],
        branchLines: [OPEN_BRANCH_LINE],
        functions: [{ name: 'halve', line: 5 }],
      }),
    }),
    unused: measuredFile('src/unused.ts', {
      statements: [0, 1],
      functions: [0, 1],
      lines: [0, 1],
    }),
    types: FileCoverage.noExecutableCode(FilePath.create('src/types.ts')),
    broken: UnmeasuredFile.create({
      path: FilePath.create('src/broken.ts'),
      reason: 'parse_failed',
      toolMessage: "')' expected.",
    }),
  };
}

/** A snapshot of the fixture project: one file in each state. */
export function fixtureSnapshot(spec: SnapshotSpec = {}): CoverageSnapshot {
  const { used, unused, types, broken } = fixtureFiles();
  return snapshotOf({
    files: [used, unused, types],
    unmeasured: [broken],
    ...spec,
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
  readonly repositoryId?: string;
  readonly originKey?: string;
  readonly files?: readonly FileCoverage[];
  readonly unmeasured?: readonly UnmeasuredFile[];
  readonly capturedAt?: string;
  readonly tests?: TestCounts | null;
}

/** What the run of the snapshot left: its files and its tests. */
function measuredOf(spec: SnapshotSpec) {
  return {
    files: spec.files ?? [],
    unmeasured: spec.unmeasured ?? [],
    testRunOutput: null,
    tests: spec.tests ?? null,
  };
}

/** A snapshot of `acme/widgets` with the files a test names. */
export function snapshotOf(spec: SnapshotSpec = {}): CoverageSnapshot {
  return CoverageSnapshot.create({
    id: SnapshotId.create(spec.id ?? SNAPSHOT_ID),
    repositoryId: RepositoryId.create(spec.repositoryId ?? REPOSITORY_ID),
    commit: CommitSha.create(SNAPSHOT_COMMIT),
    originKey: spec.originKey ?? 'scan:origin',
    project: jestProject(),
    parameters: jestParameters(),
    ...measuredOf(spec),
    capturedAt: Instant.parse(spec.capturedAt ?? CAPTURED_AT),
  });
}
