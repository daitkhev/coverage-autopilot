import type {
  TestOutcomesDto,
  TestRunDto,
} from '#coverage/application/contracts/coverage-public-api';
import type {
  FailingTestDto,
  VerificationBaselineDto,
} from '#verification/application/contracts/verification-public-api';
import type { VerificationSettings } from '#verification/application/verification-settings';

/** Enough of the name of a test for a person to find it. */
const NAME_CHARACTERS = 200;

/** How the tests of the commit ran, as the baseline keeps it. */
export interface BaselineTests {
  readonly existingTests: VerificationBaselineDto['existingTests'];
  readonly failingTests: VerificationBaselineDto['failingTests'];
}

/** The tests of the commit, or why no patch of it can be judged. */
export type BaselineTestsReading =
  | { readonly outcome: 'read'; readonly tests: BaselineTests }
  | {
      readonly outcome: 'refused';
      readonly detail: string;
      readonly outputReference: string | null;
    };

/** By code unit, so the order is the same under every locale. */
function compareTexts(first: string, second: string): number {
  return Number(first > second) - Number(first < second);
}

/** The first by its file, then by its name, a whole file before its tests. */
function firstOf(
  failing: readonly FailingTestDto[],
): FailingTestDto | undefined {
  return [...failing].sort(
    (left, right) =>
      compareTexts(left.file.value, right.file.value) ||
      compareTexts(left.test ?? '', right.test ?? ''),
  )[0];
}

function quoted(name: string): string {
  const characters = Array.from(name);
  return characters.length <= NAME_CHARACTERS
    ? `"${name}"`
    : `"${characters.slice(0, NAME_CHARACTERS).join('')}…"`;
}

function firstWords(first: FailingTestDto): string {
  return first.test === null
    ? `The first is ${first.file.value}, which failed to run.`
    : `The first is ${quoted(first.test)} in ${first.file.value}.`;
}

function refused(run: TestRunDto, detail: string): BaselineTestsReading {
  return { outcome: 'refused', detail, outputReference: run.outputReference };
}

/** No report says which tests failed, so none can be left out. */
function unnamed(run: TestRunDto): BaselineTestsReading {
  const ending =
    run.exitCode === null
      ? 'no exit code'
      : `exit code ${String(run.exitCode)}`;
  return refused(
    run,
    `The tests of the repository fail in the sandbox: their runner ended ` +
      `with ${ending} and wrote no report that names the tests that failed.`,
  );
}

function named(
  run: TestRunDto,
  outcomes: TestOutcomesDto,
  first: FailingTestDto,
): BaselineTestsReading {
  const { failing, ran } = outcomes;
  return refused(
    run,
    `${String(failing.length)} of ${String(ran)} tests of the repository ` +
      `fail in the sandbox. ${firstWords(first)}`,
  );
}

function read(tests: BaselineTests): BaselineTestsReading {
  return { outcome: 'read', tests };
}

/**
 * How the tests of the commit ran, under the rule of the settings. With
 * `may_fail` the tests that failed are kept, to be left out of every
 * check. With `must_pass` one failing test refuses the commit. A run that
 * failed and named no test, such as one that found none, holds no test to
 * stop on or to leave out.
 */
export function baselineTestsOf(
  run: TestRunDto,
  rule: VerificationSettings['baselineTests'],
): BaselineTestsReading {
  if (run.status !== 'failed') {
    const failingTests = run.status === 'passed' ? [] : null;
    return read({ existingTests: run.status, failingTests });
  }
  const { outcomes } = run;
  if (outcomes === null) {
    return unnamed(run);
  }
  const first = firstOf(outcomes.failing);
  return rule === 'must_pass' && first !== undefined
    ? named(run, outcomes, first)
    : read({ existingTests: 'failed', failingTests: outcomes.failing });
}
