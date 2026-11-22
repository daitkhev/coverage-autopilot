import type { VerificationBaseline } from '#improvement/domain/value-objects/verification-baseline.vo';
import { VerificationReport } from '#improvement/domain/value-objects/verification-report.vo';
import type {
  VerificationBaselineDto,
  VerificationReportDto,
} from '#verification/application/contracts/verification-public-api';

/**
 * The baseline of the gate as the gate gave it in `analyzing`. The gate
 * compares every patch with it, so the parts go back as they are kept.
 */
export function verificationBaselineDtoOf(
  baseline: VerificationBaseline,
): VerificationBaselineDto {
  return {
    commit: baseline.commit,
    targetFile: baseline.targetFile,
    typeCheck: baseline.typeCheck,
    existingTests: baseline.existingTests,
    mutation: baseline.mutation,
  };
}

/** The report of the gate as the attempt keeps it, part for part. */
export function verificationReportOf(
  dto: VerificationReportDto,
): VerificationReport {
  return VerificationReport.create({
    patchHash: dto.patchHash,
    verdict: dto.verdict,
    reasons: dto.reasons,
    checks: dto.checks,
    coverageBefore: dto.coverageBefore,
    coverageAfter: dto.coverageAfter,
    mutants: dto.mutants,
    survivingMutants: dto.survivingMutants,
  });
}
