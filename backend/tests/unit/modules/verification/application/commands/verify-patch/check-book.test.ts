import { describe, expect, it } from 'vitest';

import { CheckBook } from '#verification/application/commands/verify-patch/check-book';
import type { CheckProgress } from '#verification/application/contracts/verification-public-api';
import { CheckResult } from '#verification/domain/value-objects/check-result.vo';

describe('CheckBook', () => {
  it('should tell the listener when a check starts, repeats and ends', () => {
    const heard: CheckProgress[] = [];
    const book = new CheckBook((progress) => {
      heard.push(progress);
    });

    book.begin('repeated_runs');
    book.repeat('repeated_runs', { done: 1, total: 3 });
    book.record(CheckResult.passed('repeated_runs', { runs: 3 }));

    expect(heard).toEqual([
      { check: 'repeated_runs', status: 'running' },
      { check: 'repeated_runs', status: 'running', done: 1, total: 3 },
      { check: 'repeated_runs', status: 'passed' },
    ]);
  });

  it('should keep the results in the order they ended', () => {
    const book = new CheckBook(() => undefined);
    const results = [
      CheckResult.passed('test_files_only'),
      CheckResult.skipped('type_check'),
    ];

    results.forEach((result) => {
      book.record(result);
    });

    expect(book.checks).toEqual(results);
    expect(book.statusOf('type_check')).toBe('skipped');
    expect(book.statusOf('mutation_gain')).toBeNull();
  });
});
