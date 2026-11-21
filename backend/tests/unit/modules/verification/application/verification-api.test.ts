import { describe, expect, it } from 'vitest';

import { verificationApplication } from '#tests/support/verification-application';
import {
  measureRequestOf,
  policyWithout,
  verifyRequestOf,
} from '#tests/support/verification-requests';
import { VerificationApi } from '#verification/application/verification-api';

const RUNNING = new AbortController().signal;

describe('VerificationApi', () => {
  it('should measure a commit and then verify a patch against it', async () => {
    const { baselineHandler, patchHandler } = verificationApplication();
    const api = new VerificationApi(baselineHandler, patchHandler);
    const policy = policyWithout('mutation_gain');

    const measured = await api.measureBaseline(
      measureRequestOf({ policy }),
      RUNNING,
    );
    if (measured.outcome !== 'measured') {
      throw new Error('The stand-ins measure every commit.');
    }
    const report = await api.verifyPatch(
      verifyRequestOf({ baseline: measured.baseline, policy }),
      RUNNING,
    );

    expect(measured.baseline.mutation).toBeNull();
    expect(report.verdict).toBe('accepted');
  });
});
