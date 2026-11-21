import type {
  CheckResultDto,
  MutantDto,
  MutationBaselineDto,
  SurvivingMutantDto,
  UndetectedMutantDto,
} from '#verification/contracts/verification-public-api';
import type { SurvivingMutant } from '#verification/domain/services/mutation-gain.service';
import type { CheckResult } from '#verification/domain/value-objects/check-result.vo';
import { Mutant } from '#verification/domain/value-objects/mutant.vo';
import {
  MutationBaseline,
  type UndetectedMutant,
} from '#verification/domain/value-objects/mutation-baseline.vo';

/** The mutant a DTO names. Fields of a tool, such as its tests, stay out. */
export function mutantOf(dto: MutantDto): Mutant {
  return Mutant.create({
    file: dto.file,
    mutator: dto.mutator,
    startLine: dto.startLine,
    startColumn: dto.startColumn,
    endLine: dto.endLine,
    endColumn: dto.endColumn,
    replacement: dto.replacement,
  });
}

function mutantDtoOf(mutant: Mutant): MutantDto {
  return {
    file: mutant.file,
    mutator: mutant.mutator,
    startLine: mutant.startLine,
    startColumn: mutant.startColumn,
    endLine: mutant.endLine,
    endColumn: mutant.endColumn,
    replacement: mutant.replacement,
  };
}

function undetectedDtoOf(undetected: UndetectedMutant): UndetectedMutantDto {
  return { ...mutantDtoOf(undetected.mutant), status: undetected.status };
}

export function mutationBaselineOf(dto: MutationBaselineDto): MutationBaseline {
  return MutationBaseline.create({
    tool: dto.tool,
    totalMutants: dto.totalMutants,
    mutantSetHash: dto.mutantSetHash,
    undetected: dto.undetected.map((each) => ({
      mutant: mutantOf(each),
      status: each.status,
    })),
    cacheReference: dto.cacheReference,
  });
}

export function mutationBaselineDtoOf(
  baseline: MutationBaseline,
): MutationBaselineDto {
  return {
    tool: baseline.tool,
    totalMutants: baseline.totalMutants,
    mutantSetHash: baseline.mutantSetHash,
    undetected: baseline.undetected.map(undetectedDtoOf),
    cacheReference: baseline.cacheReference,
  };
}

export function survivingMutantDtoOf(
  surviving: SurvivingMutant,
): SurvivingMutantDto {
  return { ...mutantDtoOf(surviving.mutant), reached: surviving.reached };
}

export function checkResultDtoOf(result: CheckResult): CheckResultDto {
  return {
    name: result.name,
    status: result.status,
    retryable: result.retryable,
    durationMs: result.durationMs,
    runs: result.runs,
    message: result.message,
    outputReference: result.outputReference,
  };
}
