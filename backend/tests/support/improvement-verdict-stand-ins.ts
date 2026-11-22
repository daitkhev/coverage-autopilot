import { reportPropsOf } from '#tests/support/improvement-values';
import type {
  CheckProgress,
  VerificationPublicApi,
  VerificationReportDto,
  VerifyPatchRequest,
} from '#verification/contracts/verification-public-api';

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
