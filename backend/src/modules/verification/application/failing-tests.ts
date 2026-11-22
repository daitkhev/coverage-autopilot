import type {
  RunTestsResult,
  TestFailureDto,
  TestRunDto,
} from '#coverage/application/contracts/coverage-public-api';
import type { FilePath } from '#kernel/primitives/file-path';
import type { FailingTestDto } from '#verification/application/contracts/verification-public-api';

/** Enough of the name of a test for a person to find it. */
const NAME_CHARACTERS = 200;

/** By code unit, so the order is the same under every locale. */
function compareTexts(first: string, second: string): number {
  return Number(first > second) - Number(first < second);
}

/** The first by its file, then by its name, a whole file before its tests. */
export function firstOf(
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

/** The sentence that names a test that failed, for a person to find it. */
export function firstWords(first: FailingTestDto): string {
  return first.test === null
    ? `The first is ${first.file.value}, which failed to run.`
    : `The first is ${quoted(first.test)} in ${first.file.value}.`;
}

/** A file that failed to run before held no test that passed. */
function failedBefore(
  test: FailingTestDto,
  before: readonly FailingTestDto[],
): boolean {
  return before.some(
    (each) =>
      each.file.equals(test.file) &&
      (each.test === null || each.test === test.test),
  );
}

/**
 * The tests a run with the patch broke: those that fail and did not fail
 * before it. `null` when the run did not finish, or failed and named no
 * test, so nothing can be told apart.
 */
export function brokenTestsOf(
  run: TestRunDto,
  before: readonly FailingTestDto[],
): readonly FailingTestDto[] | null {
  if (run.status !== 'failed') {
    return run.status === 'passed' ? [] : null;
  }
  const failing = run.outcomes?.failing ?? [];
  return failing.length === 0
    ? null
    : failing.filter((test) => !failedBefore(test, before));
}

/** Whether the run with the patch fails only where the commit did before. */
export function passesAsBefore(
  run: RunTestsResult,
  before: readonly FailingTestDto[] | null,
): boolean {
  return (
    run.outcome === 'completed' &&
    brokenTestsOf(run.testRun, before ?? [])?.length === 0
  );
}

/**
 * What the run said first, when it is about a test the patch broke. A
 * name the runner cut for its length matches none, and gives nothing.
 */
export function failureAmong(
  failure: TestFailureDto | null,
  broken: readonly FailingTestDto[],
): TestFailureDto | null {
  return failure !== null && failedBefore(failure, broken) ? failure : null;
}

/**
 * The test files the mutation tool leaves out, each once: those with a
 * test that failed before any patch, since the tool stops when a test
 * fails before it mutates anything.
 */
export function leftOutTestFilesOf(
  failingTests: readonly FailingTestDto[] | null,
): FilePath[] {
  const files = new Map(
    (failingTests ?? []).map(({ file }) => [file.value, file]),
  );
  return [...files.values()].sort((left, right) =>
    compareTexts(left.value, right.value),
  );
}
