import type { CheckResult } from '#verification/domain/value-objects/check-result.vo';
import type { QualityPolicy } from '#verification/domain/value-objects/quality-policy.vo';
import { Verdict } from '#verification/domain/value-objects/verdict.vo';

export interface VerdictEvidence {
  readonly checks: readonly CheckResult[];
  readonly policy: QualityPolicy;
}

function hasRun(check: CheckResult): boolean {
  return check.status !== 'skipped';
}

function didNotPass(check: CheckResult): boolean {
  return check.status === 'failed' || check.status === 'error';
}

/**
 * The verdict from the results of the required checks. A required check
 * that could not finish, or that is missing from the results, leaves no
 * reliable decision, so only a complete report is accepted or rejected.
 * `not_applicable` rejects nothing: the check had nothing to examine.
 */
export function verdictOf(evidence: VerdictEvidence): Verdict {
  const { checks, policy } = evidence;
  const required = checks.filter(
    (check) => policy.requires(check.name) && hasRun(check),
  );
  const missing = policy.requiredChecks.filter(
    (name) => !required.some((check) => check.name === name),
  );
  const reasons = [
    ...missing.map((name) => `The required check ${name} did not run.`),
    ...required
      .filter(didNotPass)
      .map((check) => check.message)
      .filter((message) => message !== null),
  ];
  const errored = required.some((check) => check.status === 'error');
  if (missing.length > 0 || errored) {
    return Verdict.inconclusive(reasons);
  }
  return reasons.length > 0 ? Verdict.rejected(reasons) : Verdict.accepted();
}
