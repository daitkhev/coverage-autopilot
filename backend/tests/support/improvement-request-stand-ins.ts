import type {
  CoveragePublicApi,
  CoverageSnapshotDto,
  FileCoverageDto,
  FileCoverageRequest,
  SnapshotRequest,
} from '#coverage/contracts/coverage-public-api';
import type { StartImprovementCommand } from '#improvement/application/commands/start-improvement/start-improvement.command';
import type { RequestHasher } from '#improvement/application/ports/request-hasher.port';
import { RequestFingerprint } from '#improvement/domain/value-objects/request-fingerprint.vo';
import { CommitSha } from '#kernel/primitives/commit-sha';
import { FilePath } from '#kernel/primitives/file-path';
import { RepositoryId } from '#kernel/primitives/repository-id';
import type {
  AssessRevisionRequest,
  RepositoriesPublicApi,
  RevisionAssessmentDto,
} from '#repositories/contracts/repositories-public-api';
import {
  BASE_COMMIT,
  hashOf,
  REPOSITORY_ID,
  SOURCE_SNAPSHOT_ID,
  TARGET_FILE,
} from '#tests/support/improvement-values';
import {
  measuredTarget,
  snapshotDto,
} from '#tests/support/verification-coverage';

/** The head of the default branch once it moved past the snapshot. */
const MOVED_HEAD = 'd'.repeat(BASE_COMMIT.length);

/** A request for the target of the source snapshot, the rest left out. */
export function startCommandOf(
  spec: Partial<StartImprovementCommand> = {},
): StartImprovementCommand {
  return {
    requestKey: 'request-1',
    snapshotId: SOURCE_SNAPSHOT_ID,
    filePath: TARGET_FILE,
    ...spec,
  };
}

async function refuse(): Promise<never> {
  return Promise.reject(new Error('A request never calls this.'));
}

/** The snapshot and the file a test sets, and every read in order. */
export interface SourceCoverage extends CoveragePublicApi {
  /** The source snapshot, at the base commit of the journeys. */
  snapshot: CoverageSnapshotDto | null;
  /** The target in it, measured below the threshold. */
  file: FileCoverageDto | null;
  readonly asked: (SnapshotRequest | FileCoverageRequest)[];
}

/** The coverage module as a request reads it, in memory. */
export function sourceCoverage(): SourceCoverage {
  const stand: SourceCoverage = {
    snapshot: {
      ...snapshotDto(),
      id: SOURCE_SNAPSHOT_ID,
      repositoryId: RepositoryId.create(REPOSITORY_ID),
      commit: CommitSha.create(BASE_COMMIT),
    },
    file: {
      ...measuredTarget({ covered: 4, total: 10 }),
      path: FilePath.create(TARGET_FILE),
    },
    asked: [],
    getSnapshot: async (request) => {
      stand.asked.push(request);
      return Promise.resolve(stand.snapshot);
    },
    getFileCoverage: async (request) => {
      stand.asked.push(request);
      return Promise.resolve(stand.file);
    },
    captureSnapshot: refuse,
    prepareProject: refuse,
    runTests: refuse,
  };
  return stand;
}

/** The answer of `assessRevision` a test sets, and every request of it. */
export interface AssessingRepositories extends RepositoriesPublicApi {
  /** How the snapshot compares with the head: `current` at first. */
  assessment: RevisionAssessmentDto['outcome'];
  readonly assessed: AssessRevisionRequest[];
}

/** The repositories module as a request asks it, in memory. */
export function assessingRepositories(): AssessingRepositories {
  const stand: AssessingRepositories = {
    assessment: 'current',
    assessed: [],
    assessRevision: async (request, signal) => {
      signal.throwIfAborted();
      stand.assessed.push(request);
      const head = stand.assessment === 'current' ? BASE_COMMIT : MOVED_HEAD;
      return Promise.resolve({
        outcome: stand.assessment,
        headCommit: CommitSha.create(head),
      });
    },
    getRepository: refuse,
    checkAccess: refuse,
    resolveHead: refuse,
    createWorkingCopy: refuse,
    disposeWorkingCopy: refuse,
    extractPatch: refuse,
    applyPatch: refuse,
    publishPatch: refuse,
  };
  return stand;
}

/** The texts a hasher was given, and the one fingerprint it answers. */
export interface RecordingHasher extends RequestHasher {
  readonly texts: string[];
  /** What every text hashes to: the fingerprint of the journeys at first. */
  fingerprint: string;
}

/** A hasher that keeps the texts it is given and answers one fingerprint. */
export function recordingHasher(): RecordingHasher {
  const hasher: RecordingHasher = {
    texts: [],
    fingerprint: hashOf('f'),
    fingerprintOf: (text) => {
      hasher.texts.push(text);
      return RequestFingerprint.create(hasher.fingerprint);
    },
  };
  return hasher;
}
