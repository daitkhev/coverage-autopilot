import { describe, expect, it } from 'vitest';

import { publishPatchRequestOf } from '#improvement/application/commands/run-improvement/publication-request';
import { InvalidTransitionError } from '#improvement/domain/errors/invalid-transition.error';
import { improvementIn } from '#tests/support/improvement-journeys';
import {
  BASE_COMMIT,
  IMPROVEMENT_ID,
  patchOf,
  REPOSITORY_ID,
} from '#tests/support/improvement-values';

describe('publishPatchRequestOf', () => {
  it('should publish the accepted patch on the branch of the improvement', () => {
    const request = publishPatchRequestOf(improvementIn('publishing'));

    expect(request.repositoryId.value).toBe(REPOSITORY_ID);
    expect(request.baseCommit.value).toBe(BASE_COMMIT);
    expect(request.patchText).toBe(patchOf().text);
    expect(request.branchName).toBe(`coverage-autopilot/${IMPROVEMENT_ID}`);
  });

  it('should write the commit and the pull request about the target', () => {
    const request = publishPatchRequestOf(improvementIn('publishing'));

    expect(request.commitMessage).toBe('test: cover src/price.ts');
    expect(request.title).toBe('test: cover src/price.ts');
    expect(request.body).toContain(`Base commit: \`${BASE_COMMIT}\``);
  });

  describe('when there is no accepted patch on a branch', () => {
    it.each(['verifying', 'awaiting_approval'] as const)(
      'should refuse an improvement that is %s',
      (status) => {
        const improvement = improvementIn(status);

        expect(() => publishPatchRequestOf(improvement)).toThrow(
          InvalidTransitionError,
        );
      },
    );
  });
});
