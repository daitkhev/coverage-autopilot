import type { StepResult } from '#improvement/application/commands/run-improvement/improvement-step';
import { ImprovementFailure } from '#improvement/domain/value-objects/improvement-failure.vo';
import type { QualityPolicy } from '#improvement/domain/value-objects/quality-policy.vo';
import type {
  CheckResult,
  VerificationReport,
} from '#improvement/domain/value-objects/verification-report.vo';

/** What follows from a report of the gate, once the attempt keeps it. */
export interface VerdictFollowUp {
  /** Saved with the report, when the gate cannot decide for good. */
  readonly failure: ImprovementFailure | null;
  readonly result: StepResult;
}

const CONTINUE: StepResult = { next: 'continue' };

function erroredRequired(
  report: VerificationReport,
  policy: QualityPolicy,
): readonly CheckResult[] {
  return report.checks.filter(
    (check) =>
      check.status === 'error' && policy.requiredChecks.includes(check.name),
  );
}

function retryOf(errored: readonly CheckResult[]): StepResult {
  const names = errored.map((check) => check.name).join(', ');
  return {
    next: 'retry',
    reason: {
      code: 'verification_inconclusive',
      message:
        `The checks ${names} of the quality gate could not finish, and ` +
        'running them again may help.',
    },
  };
}

function failureOf(report: VerificationReport): ImprovementFailure {
  return ImprovementFailure.create({
    reason: 'verification_error',
    message: [
      'The quality gate could not decide on the patch.',
      ...report.reasons,
    ].join(' '),
  });
}

/**
 * `accepted` and `rejected` are the aggregate's to follow. An
 * inconclusive report says nothing about the patch: the same patch is
 * verified again when every required check that could not finish may
 * finish on another run. One error that cannot pass fails the
 * improvement at once, because a retry would only end in it again and
 * hide the reason behind spent retries.
 */
export function followUpOf(
  report: VerificationReport,
  policy: QualityPolicy,
): VerdictFollowUp {
  if (report.verdict !== 'inconclusive') {
    return { failure: null, result: CONTINUE };
  }
  const errored = erroredRequired(report, policy);
  const mayPass =
    errored.length > 0 && errored.every((check) => check.retryable);
  return mayPass
    ? { failure: null, result: retryOf(errored) }
    : { failure: failureOf(report), result: CONTINUE };
}
