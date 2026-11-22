import type {
  CoverageReport,
  CoverageReportReader,
  CoverageReportRequest,
} from '#coverage/application/ports/coverage-report-reader.port';
import type {
  ProjectDetection,
  ProjectDetector,
} from '#coverage/application/ports/project-detector.port';
import type { SourceClassifier } from '#coverage/application/ports/source-classifier.port';
import type {
  TestRunner,
  TestRunOutput,
  TestRunRequest,
} from '#coverage/application/ports/test-runner.port';
import type { CoverageSnapshot } from '#coverage/domain/entities/coverage-snapshot.entity';
import type { CoverageSnapshotRepository } from '#coverage/domain/repositories/coverage-snapshot.repository';
import type { SourceReading } from '#coverage/domain/services/file-state.service';
import type { Transaction } from '#kernel/transaction/transaction';
import type {
  ArtifactStore,
  SaveArtifactRequest,
} from '#ports/artifact-store.port';
import type { TransactionManager } from '#ports/transaction-manager.port';
import { PASSED } from '#tests/support/recording-sandbox';

/** The handle of a transaction in memory: nothing to read, as in SQLite. */
export const TRANSACTION = Object.freeze({}) as unknown as Transaction;

export interface InstantTransactions extends TransactionManager {
  /** How many write transactions ran. */
  readonly count: () => number;
}

/** Runs each operation at once, as one write transaction. */
export function instantTransactions(): InstantTransactions {
  let count = 0;
  return {
    count: () => count,
    run: async <T>(
      operation: (transaction: Transaction) => Promise<T>,
    ): Promise<T> => {
      count += 1;
      return operation(TRANSACTION);
    },
  };
}

export interface InMemorySnapshots extends CoverageSnapshotRepository {
  readonly saved: CoverageSnapshot[];
}

/** The later moment first, then the greater id, as SQLite orders them. */
function newestFirst(left: CoverageSnapshot, right: CoverageSnapshot): number {
  const byMoment =
    right.capturedAt.epochMilliseconds - left.capturedAt.epochMilliseconds;
  const [later, earlier] = [right.id.value, left.id.value];
  return byMoment === 0
    ? Number(later > earlier) - Number(later < earlier)
    : byMoment;
}

/**
 * Snapshots in memory, with one snapshot per origin key as in SQLite. It
 * starts with the snapshots a test gives.
 */
export function inMemorySnapshots(
  ...stored: CoverageSnapshot[]
): InMemorySnapshots {
  const saved = [...stored];
  const byKey = (key: string): CoverageSnapshot | null =>
    saved.find((each) => each.originKey === key) ?? null;
  return {
    saved,
    save: async (snapshot) => {
      const stored = byKey(snapshot.originKey);
      if (stored === null) {
        saved.push(snapshot);
      }
      return Promise.resolve(stored ?? snapshot);
    },
    findById: async (id) =>
      Promise.resolve(saved.find((each) => each.id.equals(id)) ?? null),
    findByOriginKey: async (key) => Promise.resolve(byKey(key)),
    listByRepository: async (repositoryId) =>
      Promise.resolve(
        saved
          .filter((each) => each.repositoryId.equals(repositoryId))
          .sort(newestFirst),
      ),
  };
}

export interface InMemoryArtifacts extends ArtifactStore {
  readonly saved: SaveArtifactRequest[];
}

/** Where the stand-in says its files are. Nothing is written there. */
export const IN_MEMORY_ARTIFACTS_FOLDER = '/instance/artifacts';

/** Keeps the n-th output under `artifact-<n>`. */
export function inMemoryArtifacts(): InMemoryArtifacts {
  const saved: SaveArtifactRequest[] = [];
  return {
    saved,
    save: async (request) => {
      saved.push(request);
      return Promise.resolve(`artifact-${String(saved.length)}`);
    },
    read: async (reference) => {
      const index = Number(reference.replace('artifact-', '')) - 1;
      return Promise.resolve(saved[index]?.content ?? null);
    },
    pathOf: (reference) => `${IN_MEMORY_ARTIFACTS_FOLDER}/${reference}`,
  };
}

export interface FixedDetector extends ProjectDetector {
  detection: ProjectDetection;
}

/** Answers every working copy with the detection a test sets. */
export function fixedDetector(detection: ProjectDetection): FixedDetector {
  const detector: FixedDetector = {
    detection,
    detect: async () => Promise.resolve(detector.detection),
  };
  return detector;
}

/** Reads each file as a test says, and any other as code that runs. */
export function fixedClassifier(
  readings: Readonly<Record<string, SourceReading>>,
): SourceClassifier {
  const byPath = new Map(Object.entries(readings));
  return {
    classify: async ({ path }) =>
      Promise.resolve(byPath.get(path.value) ?? { kind: 'executable' }),
  };
}

export interface RecordingRunner extends TestRunner {
  readonly requests: TestRunRequest[];
  output: TestRunOutput;
}

/** Where a stand-in runner says it wrote its report. */
export const REPORT_PATH =
  '/work/acme-widgets/node_modules/.cache/report/coverage-final.json';

/** A runner that starts nothing, keeps every request and answers `output`. */
export function recordingRunner(): RecordingRunner {
  const runner: RecordingRunner = {
    testRunner: 'jest',
    requests: [],
    output: { result: PASSED, reportPath: REPORT_PATH },
    run: async (request, signal) => {
      signal.throwIfAborted();
      runner.requests.push(request);
      return Promise.resolve(runner.output);
    },
  };
  return runner;
}

export interface FixedReportReader extends CoverageReportReader {
  readonly requests: CoverageReportRequest[];
  /** `null` when the runner wrote no report. */
  report: CoverageReport | null;
}

/** Keeps every request and answers the report a test sets. */
export function fixedReportReader(
  report: CoverageReport | null,
): FixedReportReader {
  const reader: FixedReportReader = {
    requests: [],
    report,
    read: async (request) => {
      reader.requests.push(request);
      return Promise.resolve(reader.report);
    },
  };
  return reader;
}
