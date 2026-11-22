import type {
  CaptureSnapshotRequest,
  CaptureSnapshotResult,
  CoveragePublicApi,
  FileCoverageDto,
  FileCoverageRequest,
} from '#coverage/contracts/coverage-public-api';
import { CommitSha } from '#kernel/primitives/commit-sha';
import { FilePath } from '#kernel/primitives/file-path';
import type {
  AssessRevisionRequest,
  RepositoriesPublicApi,
  RevisionAssessmentDto,
} from '#repositories/contracts/repositories-public-api';
import {
  BASE_COMMIT,
  BASELINE_SNAPSHOT_ID,
  mutationOf,
  TARGET_FILE,
} from '#tests/support/improvement-values';
import { standInRepositories } from '#tests/support/stand-in-repositories';
import {
  measuredTarget,
  snapshotDto,
} from '#tests/support/verification-coverage';
import type {
  BaselineProgress,
  MeasureBaselineRequest,
  MeasureBaselineResult,
  VerificationBaselineDto,
  VerificationPublicApi,
} from '#verification/contracts/verification-public-api';

const GATE_STEPS: readonly BaselineProgress['step'][] = [
  'prepare',
  'type_check',
  'existing_tests',
  'mutation_baseline',
];

async function refuse(): Promise<never> {
  return Promise.reject(new Error('The step of analyzing never calls this.'));
}

interface StandInRevisions extends RepositoriesPublicApi {
  assessment: RevisionAssessmentDto;
  readonly assessed: AssessRevisionRequest[];
}

interface StandInSnapshots extends CoveragePublicApi {
  capture: CaptureSnapshotResult;
  /** The target in the fresh snapshot, or `null` when it is not listed. */
  file: FileCoverageDto | null;
  readonly captured: CaptureSnapshotRequest[];
  readonly read: FileCoverageRequest[];
}

interface StandInGate extends VerificationPublicApi {
  result: MeasureBaselineResult;
  /** Each call throws the first that is left, before it answers. */
  readonly faults: Error[];
  readonly requests: MeasureBaselineRequest[];
  /** What the gate tells the observer before it answers. */
  heard: BaselineProgress[];
}

/** The modules below the improvement, as the step of `analyzing` asks them. */
export interface AnalysisModules {
  readonly repositories: StandInRevisions;
  readonly coverage: StandInSnapshots;
  readonly verification: StandInGate;
}

/** The baseline of the gate at the base commit, with one mutant missed. */
export function gateBaselineOf(): VerificationBaselineDto {
  return {
    commit: CommitSha.create(BASE_COMMIT),
    targetFile: FilePath.create(TARGET_FILE),
    typeCheck: 'passes',
    existingTests: 'passed',
    mutation: mutationOf(),
  };
}

/** The base commit is the head, so the request is current. */
function standInRevisions(): StandInRevisions {
  const stand: StandInRevisions = {
    ...standInRepositories(),
    assessment: {
      outcome: 'current',
      headCommit: CommitSha.create(BASE_COMMIT),
    },
    assessed: [],
    assessRevision: async (request, signal) => {
      signal.throwIfAborted();
      stand.assessed.push(request);
      return Promise.resolve(stand.assessment);
    },
  };
  return stand;
}

/** The base commit measures, with the target 4 of 10 lines covered. */
function standInSnapshots(): StandInSnapshots {
  const stand: StandInSnapshots = {
    capture: {
      outcome: 'captured',
      snapshot: {
        ...snapshotDto(),
        id: BASELINE_SNAPSHOT_ID,
        commit: CommitSha.create(BASE_COMMIT),
      },
    },
    file: {
      ...measuredTarget({ covered: 4, total: 10 }),
      path: FilePath.create(TARGET_FILE),
    },
    captured: [],
    read: [],
    captureSnapshot: async (request, signal) => {
      signal.throwIfAborted();
      stand.captured.push(request);
      return Promise.resolve(stand.capture);
    },
    getFileCoverage: async (request) => {
      stand.read.push(request);
      return Promise.resolve(stand.file);
    },
    prepareProject: refuse,
    runTests: refuse,
    getSnapshot: refuse,
  };
  return stand;
}

/** The gate measures the commit, and each of its steps starts and ends. */
function standInGate(): StandInGate {
  const stand: StandInGate = {
    result: { outcome: 'measured', baseline: gateBaselineOf() },
    faults: [],
    requests: [],
    heard: GATE_STEPS.flatMap((step) => [
      { step, status: 'running' as const },
      { step, status: 'done' as const },
    ]),
    measureBaseline: async (request, signal) => {
      signal.throwIfAborted();
      stand.requests.push(request);
      const fault = stand.faults.shift();
      if (fault !== undefined) {
        return Promise.reject(fault);
      }
      for (const progress of stand.heard) {
        request.onProgress?.(progress);
      }
      return Promise.resolve(stand.result);
    },
    verifyPatch: refuse,
  };
  return stand;
}

/** In memory, each answers what a test sets and keeps what it was asked. */
export function analysisModules(): AnalysisModules {
  return {
    repositories: standInRevisions(),
    coverage: standInSnapshots(),
    verification: standInGate(),
  };
}
