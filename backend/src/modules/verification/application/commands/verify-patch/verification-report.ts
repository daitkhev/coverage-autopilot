import type { CheckBook } from '#verification/application/commands/verify-patch/check-book';
import type { GateEvidence } from '#verification/application/commands/verify-patch/patched-copy';
import type { VerifyPatchCommand } from '#verification/application/commands/verify-patch/verify-patch.command';
import { checkResultDtoOf } from '#verification/application/dto/verification-dto-mapping';
import type { VerificationReportDto } from '#verification/contracts/verification-public-api';
import { verdictOf } from '#verification/domain/services/verdict.service';
import type { QualityPolicy } from '#verification/domain/value-objects/quality-policy.vo';

export interface FinishedGate {
  readonly command: VerifyPatchCommand;
  readonly policy: QualityPolicy;
  readonly book: CheckBook;
  readonly evidence: GateEvidence;
}

type CoverageParts = Pick<
  VerificationReportDto,
  'coverageBefore' | 'coverageAfter'
>;

type MutantParts = Pick<VerificationReportDto, 'mutants' | 'survivingMutants'>;

function coveragePartsOf({ coverage }: GateEvidence): CoverageParts {
  return coverage === null
    ? { coverageBefore: null, coverageAfter: null }
    : { coverageBefore: coverage.before, coverageAfter: coverage.after };
}

function mutantPartsOf({ mutation }: GateEvidence): MutantParts {
  return mutation === null
    ? { mutants: null, survivingMutants: [] }
    : { mutants: mutation.counts, survivingMutants: mutation.surviving };
}

/** The report of a patch: every check in order, and the verdict they give. */
export function reportOf(gate: FinishedGate): VerificationReportDto {
  const { checks } = gate.book;
  const verdict = verdictOf({ checks, policy: gate.policy });
  return {
    patchHash: gate.command.patch.hash,
    verdict: verdict.value,
    reasons: verdict.reasons,
    checks: checks.map(checkResultDtoOf),
    ...coveragePartsOf(gate.evidence),
    ...mutantPartsOf(gate.evidence),
  };
}
