import {
  type MutationBaseline,
  VerificationBaseline,
} from '#improvement/domain/value-objects/verification-baseline.vo';
import type {
  MutationBaselineDto,
  VerificationBaselineDto,
} from '#verification/application/contracts/verification-public-api';

function mutationOf(dto: MutationBaselineDto): MutationBaseline {
  return {
    tool: { ...dto.tool },
    totalMutants: dto.totalMutants,
    mutantSetHash: dto.mutantSetHash,
    undetected: dto.undetected.map((mutant) => ({ ...mutant })),
    cacheReference: dto.cacheReference,
  };
}

/**
 * The baseline of the gate as the improvement keeps it. The improvement
 * gives it back to every check of a patch, so it holds a copy of its own
 * and nothing the gate answered with.
 */
export function verificationBaselineOf(
  dto: VerificationBaselineDto,
): VerificationBaseline {
  return VerificationBaseline.create({
    commit: dto.commit,
    targetFile: dto.targetFile,
    typeCheck: dto.typeCheck,
    existingTests: dto.existingTests,
    mutation: dto.mutation === null ? null : mutationOf(dto.mutation),
  });
}
