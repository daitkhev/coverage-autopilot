import { describe, expect, it } from 'vitest';

import type {
  FailingTestDto,
  TestRunDto,
} from '#coverage/application/contracts/coverage-public-api';
import { FilePath } from '#kernel/primitives/file-path';
import {
  FAILING_TESTS,
  failingRunOf,
  testRunOf,
  UNSUPPORTED_RUN,
} from '#tests/support/verification-coverage';
import {
  brokenTestsOf,
  failureAmong,
  firstOf,
  leftOutTestFilesOf,
  passesAsBefore,
} from '#verification/application/failing-tests';

function testIn(file: string, test: string | null): FailingTestDto {
  return { file: FilePath.create(file), test };
}

function runOf(status: TestRunDto['status'], failing: FailingTestDto[]) {
  return {
    status,
    exitCode: null,
    durationMs: 900,
    outputReference: null,
    firstFailure: null,
    outcomes: { ran: 4, failing },
  };
}

describe('firstOf', () => {
  it('should order by file, then by name, a whole file before its tests', () => {
    const failing = [
      testIn('tests/b.test.ts', 'b'),
      testIn('tests/a.test.ts', 'z'),
      testIn('tests/a.test.ts', null),
    ];

    expect(firstOf(failing)).toEqual(testIn('tests/a.test.ts', null));
    expect(firstOf([])).toBeUndefined();
  });
});

describe('brokenTestsOf', () => {
  it('should find no broken test in a run that passed', () => {
    expect(brokenTestsOf(runOf('passed', []), FAILING_TESTS)).toEqual([]);
  });

  it('should tell nothing apart in a run that timed out or named no test', () => {
    expect(brokenTestsOf(runOf('timed_out', []), [])).toBeNull();
    expect(brokenTestsOf(runOf('failed', []), FAILING_TESTS)).toBeNull();
  });

  it('should keep only the tests that did not fail before', () => {
    const broken = testIn('tests/feed.test.ts', 'feed > skips the old');
    const run = runOf('failed', [
      ...FAILING_TESTS,
      testIn('tests/clock.test.ts', 'clock > ticks'),
      broken,
    ]);

    expect(brokenTestsOf(run, FAILING_TESTS)).toEqual([broken]);
  });

  it('should count a file that failed to run now, after some of its tests failed', () => {
    const whole = testIn('tests/feed.test.ts', null);

    expect(brokenTestsOf(runOf('failed', [whole]), FAILING_TESTS)).toEqual([
      whole,
    ]);
  });
});

describe('passesAsBefore', () => {
  it.each([
    { name: 'a run that passed', run: testRunOf('passed'), before: [] },
    {
      name: 'a run that failed as before',
      run: failingRunOf(),
      before: FAILING_TESTS,
    },
  ])('should pass $name', ({ run, before }) => {
    expect(passesAsBefore(run, before)).toBe(true);
  });

  it.each([
    {
      name: 'a run that failed after a commit that passed',
      run: failingRunOf(),
      before: [],
    },
    {
      name: 'a run after a baseline that is not known',
      run: failingRunOf(),
      before: null,
    },
    { name: 'a runner that cannot run', run: UNSUPPORTED_RUN, before: [] },
  ])('should not pass $name', ({ run, before }) => {
    expect(passesAsBefore(run, before)).toBe(false);
  });
});

describe('failureAmong', () => {
  it('should give the failure only when it is about a broken test', () => {
    const broken = [testIn('tests/a.test.ts', 'a')];
    const failure = { ...testIn('tests/a.test.ts', 'a'), lines: ['Error'] };
    const other = { ...testIn('tests/b.test.ts', 'b'), lines: ['Error'] };

    expect(failureAmong(failure, broken)).toBe(failure);
    expect(failureAmong(other, broken)).toBeNull();
    expect(failureAmong(null, broken)).toBeNull();
  });
});

describe('leftOutTestFilesOf', () => {
  it('should give each file with a failing test once, in order', () => {
    const failing = [
      testIn('tests/b.test.ts', 'one'),
      testIn('tests/a.test.ts', null),
      testIn('tests/b.test.ts', 'two'),
    ];

    expect(leftOutTestFilesOf(failing)).toEqual([
      FilePath.create('tests/a.test.ts'),
      FilePath.create('tests/b.test.ts'),
    ]);
  });

  it('should leave out nothing when the failing tests are not known', () => {
    expect(leftOutTestFilesOf(null)).toEqual([]);
  });
});
