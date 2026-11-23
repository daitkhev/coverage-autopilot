import { CommitSha } from '#kernel/primitives/commit-sha';
import type {
  AssessRevisionRequest,
  PublishPatchRequest,
  PublishPatchResult,
  RevisionAssessmentDto,
} from '#repositories/application/contracts/repositories-public-api';
import { pullRequestOf } from '#tests/support/improvement-journeys';
import {
  IMPROVEMENT_ID,
  reportPropsOf,
} from '#tests/support/improvement-values';
import {
  type StandInRepositories,
  standInRepositories,
} from '#tests/support/stand-in-repositories';
import type {
  CheckProgress,
  VerificationPublicApi,
  VerificationReportDto,
  VerifyPatchRequest,
} from '#verification/application/contracts/verification-public-api';

const SHA1_DIGITS = 40;

/** The head of the default branch when publishing looks at it. */
export const HEAD_COMMIT = 'c'.repeat(SHA1_DIGITS);

/** How the name of a test file ends in every request of these tests. */
export const TEST_FILE_SUFFIXES = ['.test.ts', '.test.tsx'];

/** The gate of a test, with what it was asked and what it will answer. */
export interface StandInGate extends VerificationPublicApi {
  readonly requests: VerifyPatchRequest[];
  /** Told to the observer of every call before it answers. */
  readonly progress: CheckProgress[];
  /**
   * The parts of the next reports, in order, about the patch each call
   * names. Once none is left, the gate accepts.
   */
  readonly answers: Partial<VerificationReportDto>[];
}

async function refuse(): Promise<never> {
  return Promise.reject(new Error('A step of a verdict never calls this.'));
}

/**
 * The quality gate as the improvement module calls it, in memory. It
 * keeps the requests, tells the observer what a test gives it, and
 * stops on an aborted signal as the gate does.
 */
export function standInGate(): StandInGate {
  const gate: StandInGate = {
    requests: [],
    progress: [],
    answers: [],
    measureBaseline: refuse,
    verifyPatch: async (request, signal) => {
      signal.throwIfAborted();
      gate.requests.push(request);
      gate.progress.forEach((progress) => request.onProgress?.(progress));
      return Promise.resolve({
        ...reportPropsOf('accepted'),
        patchHash: request.patch.hash,
        ...gate.answers.shift(),
      });
    },
  };
  return gate;
}

/** The repositories of a test, with what publishing asked and will get. */
export interface StandInPublisher extends StandInRepositories {
  readonly assessed: AssessRevisionRequest[];
  readonly publications: PublishPatchRequest[];
  /** What the head of the default branch says about the snapshot. */
  assessment: RevisionAssessmentDto['outcome'];
  /** The answer of every publication. */
  publication: PublishPatchResult;
}

/** What publishing answers once the pull request is there. */
function publishedResult(): PublishPatchResult {
  const pullRequest = pullRequestOf();
  return {
    outcome: 'published',
    branchName: `coverage-autopilot/${IMPROVEMENT_ID}`,
    pullRequestUrl: pullRequest.url,
    pullRequestNumber: pullRequest.number,
  };
}

/**
 * The repositories module as publishing uses it: the head of the default
 * branch has moved to `HEAD_COMMIT`, and the patch is published unless a
 * test says otherwise. It keeps every request.
 */
export function standInPublisher(): StandInPublisher {
  const stand: StandInPublisher = {
    ...standInRepositories(),
    assessed: [],
    publications: [],
    assessment: 'unchanged',
    publication: publishedResult(),
    assessRevision: async (request, signal) => {
      signal.throwIfAborted();
      stand.assessed.push(request);
      return Promise.resolve({
        outcome: stand.assessment,
        headCommit: CommitSha.create(HEAD_COMMIT),
      });
    },
    publishPatch: async (request, signal) => {
      signal.throwIfAborted();
      stand.publications.push(request);
      return Promise.resolve(stand.publication);
    },
  };
  return stand;
}
