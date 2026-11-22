import { SnapshotCapture } from '#coverage/application/commands/capture-snapshot/snapshot-capture';
import { PrepareProjectHandler } from '#coverage/application/commands/prepare-project/prepare-project.handler';
import { TestExecution } from '#coverage/application/commands/run-tests/test-execution';
import type { CoverageReport } from '#coverage/application/ports/coverage-report-reader.port';
import type { SupportedProject } from '#coverage/application/ports/project-detector.port';
import { RepositoryThresholds } from '#coverage/application/repository-thresholds';
import type { ReportedCoverage } from '#coverage/domain/services/file-state.service';
import type { FileCoverage } from '#coverage/domain/value-objects/file-coverage.vo';
import {
  CAPTURED_AT,
  fixtureFiles,
  jestParameters,
  jestProject,
} from '#tests/support/coverage-snapshots';
import {
  fixedClassifier,
  type FixedDetector,
  fixedDetector,
  type FixedReportReader,
  fixedReportReader,
  type InMemoryArtifacts,
  inMemoryArtifacts,
  type InMemorySnapshots,
  inMemorySnapshots,
  type InstantTransactions,
  instantTransactions,
  type RecordingRunner,
  recordingRunner,
} from '#tests/support/coverage-stand-ins';
import { FixedClock } from '#tests/support/fixed-clock';
import {
  COVERAGE_TEST_SETTINGS,
  RecordingSandbox,
} from '#tests/support/recording-sandbox';
import { SequentialIdGenerator } from '#tests/support/sequential-id-generator';
import {
  type StandInRepositories,
  standInRepositories,
} from '#tests/support/stand-in-repositories';

/** The install command the stand-in detector names. */
export const INSTALL_COMMAND = ['npm', 'ci', '--ignore-scripts'];

/** The first id the sequential generator gives. */
export const FIRST_ID = '00000000-0000-4000-8000-000000000001';

/** The fixture project, detected: a Jest project with four sources. */
export function supportedProject(): SupportedProject {
  const { used, unused, types, broken } = fixtureFiles();
  return {
    outcome: 'supported',
    project: jestProject(),
    parameters: jestParameters(),
    installCommand: INSTALL_COMMAND,
    eligibleFiles: [broken.path, types.path, unused.path, used.path],
  };
}

function rowOf(file: FileCoverage): [string, ReportedCoverage] {
  return [
    file.path.value,
    { counters: file.counters, uncovered: file.uncovered },
  ];
}

/** What Jest reports for the fixture project: the two files with code. */
function fixtureReport(): CoverageReport {
  const { used, unused } = fixtureFiles();
  return new Map([rowOf(used), rowOf(unused)]);
}

/** Every stand-in of the application, and the parts wired over them. */
export interface CoverageApplication {
  readonly repositories: StandInRepositories;
  readonly snapshots: InMemorySnapshots;
  readonly transactions: InstantTransactions;
  readonly artifacts: InMemoryArtifacts;
  readonly sandbox: RecordingSandbox;
  readonly detector: FixedDetector;
  readonly runner: RecordingRunner;
  readonly reader: FixedReportReader;
  readonly preparation: PrepareProjectHandler;
  readonly tests: TestExecution;
  readonly capture: SnapshotCapture;
  /** The threshold of the stand-in repository, asked of it each time. */
  readonly thresholds: RepositoryThresholds;
}

/**
 * The application of the coverage module over stand-ins, set for the
 * fixture project: the types file has declarations alone and the broken
 * file does not parse. A test changes a stand-in to take another path.
 */
export function coverageApplication(): CoverageApplication {
  const repositories = standInRepositories();
  const artifacts = inMemoryArtifacts();
  const sandbox = new RecordingSandbox();
  const detector = fixedDetector(supportedProject());
  const runner = recordingRunner();
  const reader = fixedReportReader(fixtureReport());
  const classifier = fixedClassifier({
    'src/types.ts': { kind: 'declarations_only' },
    'src/broken.ts': { kind: 'parse_failed', message: "')' expected." },
  });
  const settings = COVERAGE_TEST_SETTINGS;
  const preparation = new PrepareProjectHandler(
    detector,
    sandbox,
    artifacts,
    settings,
  );
  const tests = new TestExecution(classifier, [runner], reader, artifacts);
  const capture = new SnapshotCapture(
    repositories,
    preparation,
    tests,
    new FixedClock(CAPTURED_AT),
    new SequentialIdGenerator(),
  );
  return {
    repositories,
    snapshots: inMemorySnapshots(),
    transactions: instantTransactions(),
    artifacts,
    sandbox,
    detector,
    runner,
    reader,
    preparation,
    tests,
    capture,
    thresholds: new RepositoryThresholds(repositories),
  };
}
