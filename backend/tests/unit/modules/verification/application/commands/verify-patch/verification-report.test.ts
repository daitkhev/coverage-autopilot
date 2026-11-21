import { describe, expect, it } from 'vitest';

import { mutantAt } from '#tests/support/verification-mutants';
import {
  policyOf,
  verifyRequestOf,
} from '#tests/support/verification-requests';
import { CheckBook } from '#verification/application/commands/verify-patch/check-book';
import { reportOf } from '#verification/application/commands/verify-patch/verification-report';
import { CheckResult } from '#verification/domain/value-objects/check-result.vo';
import { QualityPolicy } from '#verification/domain/value-objects/quality-policy.vo';

const COUNTER = { covered: 1, total: 2 };
const TARGET = {
  statements: COUNTER,
  branches: COUNTER,
  functions: COUNTER,
  lines: COUNTER,
};

function bookOf(...results: CheckResult[]): CheckBook {
  const book = new CheckBook(() => undefined);
  results.forEach((result) => {
    book.record(result);
  });
  return book;
}

describe('reportOf', () => {
  it('should repeat the hash of the patch and carry the verdict', () => {
    const report = reportOf({
      command: verifyRequestOf(),
      policy: QualityPolicy.create(
        policyOf({ requiredChecks: ['test_files_only'] }),
      ),
      book: bookOf(
        CheckResult.failed('test_files_only', 'The patch deletes x.ts.'),
      ),
      evidence: { coverage: null, mutation: null },
    });

    expect(report).toEqual({
      patchHash: 'patch-hash',
      verdict: 'rejected',
      reasons: ['The patch deletes x.ts.'],
      checks: [
        expect.objectContaining({ name: 'test_files_only', status: 'failed' }),
      ],
      coverageBefore: null,
      coverageAfter: null,
      mutants: null,
      survivingMutants: [],
    });
  });

  it('should carry what the checks of coverage and mutants saw', () => {
    const counts = { undetectedBefore: 3, killed: 1, reached: 2, timedOut: 0 };
    const surviving = [{ ...mutantAt(4), reached: true }];

    const report = reportOf({
      command: verifyRequestOf(),
      policy: QualityPolicy.create(
        policyOf({ requiredChecks: ['test_files_only'] }),
      ),
      book: bookOf(CheckResult.passed('test_files_only')),
      evidence: {
        coverage: { before: TARGET, after: TARGET },
        mutation: { counts, surviving },
      },
    });

    expect(report).toMatchObject({
      verdict: 'accepted',
      coverageBefore: TARGET,
      coverageAfter: TARGET,
      mutants: counts,
      survivingMutants: surviving,
    });
  });
});
