import { describe, expect, it } from 'vitest';

import {
  type GateCall,
  verifyPatchRequestOf,
} from '#improvement/application/commands/run-improvement/verification-request';
import { InvalidTransitionError } from '#improvement/domain/errors/invalid-transition.error';
import { improvementIn } from '#tests/support/improvement-journeys';
import {
  BASE_COMMIT,
  BASELINE_SNAPSHOT_ID,
  IMPROVEMENT_ID,
  patchOf,
  policyOf,
  REPOSITORY_ID,
  TARGET_FILE,
} from '#tests/support/improvement-values';
import { TEST_FILE_SUFFIXES } from '#tests/support/improvement-verdict-stand-ins';

const OWNER = `improvement:${IMPROVEMENT_ID}`;

function callOf(): GateCall {
  return {
    owner: OWNER,
    testFileSuffixes: TEST_FILE_SUFFIXES,
    onProgress: () => undefined,
  };
}

describe('verifyPatchRequestOf', () => {
  it('should ask about the stored patch with what the improvement keeps', () => {
    const improvement = improvementIn('verifying');
    const call = callOf();

    const request = verifyPatchRequestOf(improvement, call);

    const { text, hash } = patchOf();
    expect(request.repositoryId.value).toBe(REPOSITORY_ID);
    expect(request.baseCommit.value).toBe(BASE_COMMIT);
    expect(request.patch).toEqual({ text, hash });
    expect(request.targetFile.value).toBe(TARGET_FILE);
    expect(request.testFileSuffixes).toBe(TEST_FILE_SUFFIXES);
    expect(request.baselineSnapshotId).toBe(BASELINE_SNAPSHOT_ID);
    expect(request.deadline).toEqual(improvement.deadlineAt);
    expect(request.onProgress).toBe(call.onProgress);
  });

  it('should give the policy as its three parts', () => {
    const request = verifyPatchRequestOf(improvementIn('verifying'), callOf());

    const policy = policyOf();
    expect(request.policy).toEqual({
      requiredChecks: policy.requiredChecks,
      repeatedRuns: policy.repeatedRuns,
      mutationThreshold: policy.mutationThreshold,
    });
  });

  it('should give the baseline of the gate back as the improvement keeps it', () => {
    const improvement = improvementIn('verifying');

    const { baseline } = verifyPatchRequestOf(improvement, callOf());

    const kept = improvement.verificationBaseline;
    expect(baseline.commit).toBe(kept?.commit);
    expect(baseline.targetFile).toBe(kept?.targetFile);
    expect(baseline.mutation).toBe(kept?.mutation);
  });

  it('should name the attempt as the owner of the work', () => {
    const request = verifyPatchRequestOf(improvementIn('verifying'), callOf());

    expect(request.owner).toBe(`${OWNER}:attempt:1`);
  });

  describe('when the improvement has no open attempt with a patch', () => {
    it('should refuse to make a request', () => {
      const improvement = improvementIn('generating');

      expect(() => verifyPatchRequestOf(improvement, callOf())).toThrow(
        InvalidTransitionError,
      );
    });
  });
});
