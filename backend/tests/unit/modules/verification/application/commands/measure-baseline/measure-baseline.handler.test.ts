import { describe, expect, it } from 'vitest';

import { Instant } from '#kernel/time/instant';
import { verificationApplication } from '#tests/support/verification-application';
import {
  HOUR_MS,
  measureRequestOf,
  NOW,
  policyOf,
} from '#tests/support/verification-requests';
import type { BaselineProgress } from '#verification/application/contracts/verification-public-api';
import { InvalidQualityPolicyError } from '#verification/domain/errors/invalid-quality-policy.error';

const RUNNING = new AbortController().signal;

describe('MeasureBaselineHandler', () => {
  describe('execute', () => {
    it('should measure the commit and tell the observer of the request', async () => {
      const { baselineHandler } = verificationApplication();
      const heard: BaselineProgress[] = [];

      const result = await baselineHandler.execute(
        measureRequestOf({ onProgress: (progress) => heard.push(progress) }),
        RUNNING,
      );

      expect(result.outcome).toBe('measured');
      expect(heard).toHaveLength(8);
    });

    it('should measure with no observer at all', async () => {
      const { baselineHandler } = verificationApplication();

      const result = await baselineHandler.execute(measureRequestOf(), RUNNING);

      expect(result.outcome).toBe('measured');
    });

    it('should read the deadline of the request against its clock', async () => {
      const { baselineHandler, clock } = verificationApplication();
      clock.advance(HOUR_MS);

      const result = await baselineHandler.execute(
        measureRequestOf({
          deadline: Instant.parse(NOW).plusMilliseconds(HOUR_MS * 2),
        }),
        RUNNING,
      );

      expect(result.outcome).toBe('measured');
    });

    describe('when the policy cannot be used', () => {
      it('should throw InvalidQualityPolicyError and clone nothing', async () => {
        const { baselineHandler, repositories } = verificationApplication();

        await expect(
          baselineHandler.execute(
            measureRequestOf({ policy: policyOf({ repeatedRuns: 0 }) }),
            RUNNING,
          ),
        ).rejects.toThrow(InvalidQualityPolicyError);
        expect(repositories.created).toEqual([]);
      });
    });

    describe('when the signal is aborted', () => {
      it('should throw', async () => {
        const { baselineHandler } = verificationApplication();
        const controller = new AbortController();
        controller.abort();

        await expect(
          baselineHandler.execute(measureRequestOf(), controller.signal),
        ).rejects.toThrow();
      });
    });
  });
});
