import type {
  CoverageCounterDto,
  CoverageCountersDto,
} from '#coverage/contracts/coverage-public-api';
import type {
  AttemptDto,
  VerificationReportDto,
} from '#improvement/application/dto/attempt.dto';
import type { Attempt } from '#improvement/domain/entities/attempt.entity';
import type {
  TargetCoverage,
  VerificationReport,
} from '#improvement/domain/value-objects/verification-report.vo';

const WHOLE = 100;

/** The percentage travels with its counts, so the client computes nothing. */
function counterDtoOf(count: TargetCoverage['lines']): CoverageCounterDto {
  const { covered, total } = count;
  return {
    covered,
    total,
    percentage: total === 0 ? null : (covered * WHOLE) / total,
  };
}

function countersDtoOf(
  coverage: TargetCoverage | null,
): CoverageCountersDto | null {
  return coverage === null
    ? null
    : {
        statements: counterDtoOf(coverage.statements),
        branches: counterDtoOf(coverage.branches),
        functions: counterDtoOf(coverage.functions),
        lines: counterDtoOf(coverage.lines),
      };
}

function reportDtoOf(report: VerificationReport): VerificationReportDto {
  const { mutants } = report;
  return {
    patchHash: report.patchHash,
    verdict: report.verdict,
    reasons: [...report.reasons],
    checks: report.checks.map((check) => ({
      name: check.name,
      status: check.status,
      retryable: check.retryable,
      durationMs: check.durationMs,
      runs: check.runs,
      message: check.message,
    })),
    coverageBefore: countersDtoOf(report.coverageBefore),
    coverageAfter: countersDtoOf(report.coverageAfter),
    mutants:
      mutants === null
        ? null
        : {
            undetectedBefore: mutants.undetectedBefore,
            killed: mutants.killed,
            reached: mutants.reached,
          },
    survivingMutants: report.survivingMutants.map((mutant) => ({
      line: mutant.startLine,
      mutator: mutant.mutator,
      replacement: mutant.replacement,
      reached: mutant.reached,
    })),
  };
}

/**
 * Every raw output of an attempt, each once: the calls of the generator,
 * then the checks of the gate, which may share the output of one run.
 */
function rawOutputOf(attempt: Attempt): string[] {
  const checks = attempt.report?.checks ?? [];
  const references = [
    ...attempt.outputReferences,
    ...checks.map((check) => check.outputReference),
  ];
  return [...new Set(references.filter((reference) => reference !== null))];
}

/** An attempt as a person sees it: values only, the report included. */
export function attemptDtoOf(attempt: Attempt): AttemptDto {
  const { report } = attempt;
  return {
    number: attempt.number,
    status: attempt.isOpen ? 'open' : 'closed',
    startedAt: attempt.startedAt,
    finishedAt: attempt.finishedAt,
    generationOutcome: attempt.outcome,
    tokensUsed: attempt.tokensUsed,
    patchHash: attempt.patch?.hash ?? null,
    report: report === null ? null : reportDtoOf(report),
    rawOutputReferences: rawOutputOf(attempt),
  };
}
