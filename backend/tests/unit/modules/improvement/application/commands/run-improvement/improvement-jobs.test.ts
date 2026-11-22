import { describe, expect, it } from 'vitest';

import {
  IMPROVEMENT_JOB_VERSION,
  publishJobOf,
  resumeJobOf,
  runJobOf,
} from '#improvement/application/commands/run-improvement/improvement-jobs';
import {
  improvementIn,
  WINDOW_OPENS_AT,
} from '#tests/support/improvement-journeys';
import {
  IMPROVEMENT_ID,
  REPOSITORY_ID,
} from '#tests/support/improvement-values';

describe('the jobs of an improvement', () => {
  describe('runJobOf', () => {
    it('should name the improvement, its repository and the first run', () => {
      const job = runJobOf(improvementIn('created'));

      expect(job).toEqual({
        kind: 'improvement',
        repositoryId: improvementIn('created').request.repositoryId,
        idempotencyKey: `improvement:${IMPROVEMENT_ID}:run`,
        subjectId: IMPROVEMENT_ID,
        payload: { version: IMPROVEMENT_JOB_VERSION },
      });
      expect(job.repositoryId.value).toBe(REPOSITORY_ID);
    });
  });

  describe('publishJobOf', () => {
    it('should have a key of its own, so an approval adds a second job', () => {
      const job = publishJobOf(improvementIn('publishing'));

      expect(job.idempotencyKey).toBe(`improvement:${IMPROVEMENT_ID}:publish`);
      expect(job.notBefore).toBeUndefined();
    });
  });

  describe('resumeJobOf', () => {
    it('should wait for the moment and be named by the number of the wait', () => {
      const waiting = improvementIn('waiting_for_limit');

      const job = resumeJobOf(waiting, WINDOW_OPENS_AT);

      expect(waiting.limitWaits).toBe(1);
      expect(job.idempotencyKey).toBe(`improvement:${IMPROVEMENT_ID}:resume:1`);
      expect(job.notBefore).toBe(WINDOW_OPENS_AT);
      expect(job.payload).toEqual({ version: IMPROVEMENT_JOB_VERSION });
    });
  });
});
