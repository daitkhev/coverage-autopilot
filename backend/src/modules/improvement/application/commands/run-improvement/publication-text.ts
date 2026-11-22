import type { CheckName } from '#improvement/domain/value-objects/quality-policy.vo';
import type {
  CheckResult,
  TargetCoverage,
  VerificationReport,
} from '#improvement/domain/value-objects/verification-report.vo';
import type { CommitSha } from '#kernel/primitives/commit-sha';
import type { FilePath } from '#kernel/primitives/file-path';

/** The one author the text names: the tool, never a model or a person. */
const TOOL = 'coverage-autopilot';

/** The longest header that hosts and `git log --oneline` show whole. */
const HEADER_MAX_LENGTH = 72;

const HEADER_PREFIX = 'test: cover ';

/** A share is shown in tenths of a percent, rounded down. */
const TENTHS_OF_A_PERCENT = 1000;
const TENTHS = 10;

const PARAGRAPH = '\n\n';

/** The work a pull request shows: the file, its commit and its verdict. */
export interface PublishedWork {
  readonly targetFile: FilePath;
  readonly baseCommit: CommitSha;
  /** The report of the accepted attempt. */
  readonly report: VerificationReport;
}

/** What publishing writes for the commit and for the pull request. */
export interface PublicationText {
  readonly commitMessage: string;
  readonly title: string;
  /** Markdown. */
  readonly body: string;
}

const METRICS: readonly (readonly [keyof TargetCoverage, string])[] = [
  ['statements', 'Statements'],
  ['branches', 'Branches'],
  ['functions', 'Functions'],
  ['lines', 'Lines'],
];

/** Names, not claims: a check is listed under what it ended in. */
const CHECK_LABELS: Readonly<Record<CheckName, string>> = {
  test_files_only: 'New test files only',
  type_check: 'Type check',
  new_tests_pass: 'New tests pass',
  existing_tests_pass: 'Existing tests still pass',
  repeated_runs: 'Repeated runs',
  coverage_increase: 'Coverage increase',
  mutation_gain: 'Mutants killed that no test detected',
};

/** An accepted report holds no check that failed or ended in error. */
const CHECK_GROUPS: readonly (readonly [CheckResult['status'], string])[] = [
  ['passed', 'Checks that passed:'],
  ['skipped', 'Checks the quality policy turned off:'],
  ['not_applicable', 'Checks that had nothing to examine:'],
];

/** At most so many characters, with a mark where the text was cut. */
export function shortened(text: string, length: number): string {
  return text.length <= length ? text : `${text.slice(0, length - 1)}…`;
}

/** A long path gives way to the name of the file, which is kept whole. */
function headerOf(file: FilePath): string {
  const whole = `${HEADER_PREFIX}${file.value}`;
  if (whole.length <= HEADER_MAX_LENGTH) {
    return whole;
  }
  const name = file.value.slice(file.value.lastIndexOf('/') + 1);
  return shortened(`${HEADER_PREFIX}${name}`, HEADER_MAX_LENGTH);
}

/** Rounded down, so a file is never shown whole before it is. */
function shareOf({ covered, total }: TargetCoverage['lines']): string {
  const counts = `${String(covered)} of ${String(total)}`;
  if (total === 0) {
    return counts;
  }
  const tenths = Math.floor((covered * TENTHS_OF_A_PERCENT) / total);
  return `${(tenths / TENTHS).toFixed(1)}% (${counts})`;
}

function tableOf(before: TargetCoverage, after: TargetCoverage): string {
  return [
    '| Coverage of the file | Before | After |',
    '| --- | ---: | ---: |',
    ...METRICS.map(
      ([metric, label]) =>
        `| ${label} | ${shareOf(before[metric])} | ${shareOf(after[metric])} |`,
    ),
  ].join('\n');
}

/** Left out when the gate did not measure both sides: never a guess. */
function coverageOf(report: VerificationReport): string[] {
  const { coverageBefore, coverageAfter } = report;
  return coverageBefore === null || coverageAfter === null
    ? []
    : [tableOf(coverageBefore, coverageAfter)];
}

function mutantsOf(report: VerificationReport): string[] {
  const { mutants } = report;
  return mutants === null
    ? []
    : [
        `Mutants no test detected before: ${String(mutants.undetectedBefore)}. ` +
          `The new tests kill ${String(mutants.killed)} of them.`,
      ];
}

function labelOf(check: CheckResult): string {
  const label = CHECK_LABELS[check.name];
  return check.runs === null ? label : `${label} (${String(check.runs)} runs)`;
}

function listOf(title: string, checks: readonly CheckResult[]): string {
  return [title, '', ...checks.map((check) => `- ${labelOf(check)}`)].join(
    '\n',
  );
}

function checksOf(report: VerificationReport): string[] {
  return CHECK_GROUPS.flatMap(([status, title]) => {
    const listed = report.checks.filter((check) => check.status === status);
    return listed.length === 0 ? [] : [listOf(title, listed)];
  });
}

function bodyOf(work: PublishedWork): string {
  const { report } = work;
  return [
    `This pull request adds tests for \`${work.targetFile.value}\`, to ` +
      'cover more of its code and to catch a change to what it does.',
    ...coverageOf(report),
    ...mutantsOf(report),
    ...checksOf(report),
    `Base commit: \`${work.baseCommit.value}\``,
    `Written and checked by ${TOOL}.`,
  ].join(PARAGRAPH);
}

/**
 * The text of a publication. The header follows Conventional Commits and
 * is both the commit message and the title. The body shows what the gate
 * measured on the accepted attempt and nothing it did not.
 */
export function publicationTextOf(work: PublishedWork): PublicationText {
  const header = headerOf(work.targetFile);
  return { commitMessage: header, title: header, body: bodyOf(work) };
}
