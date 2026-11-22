import type { CoverageCountersDto } from '#coverage/application/contracts/coverage-public-api';
import type { GenerationOutcome } from '#improvement/domain/value-objects/generation.vo';
import type { CheckName } from '#improvement/domain/value-objects/quality-policy.vo';
import type {
  CheckResult,
  Verdict,
} from '#improvement/domain/value-objects/verification-report.vo';
import type { FilePath } from '#kernel/primitives/file-path';
import type { Instant } from '#kernel/time/instant';

/** What a failed run of tests said first; `test` is `null` if none ran. */
interface TestFailureDto {
  readonly file: FilePath;
  readonly test: string | null;
  readonly lines: readonly string[];
}

/** `retryable` matters for `error` only: whether a rerun can help. */
export interface CheckResultDto {
  readonly name: CheckName;
  readonly status: CheckResult['status'];
  readonly retryable: boolean;
  readonly durationMs: number | null;
  readonly runs: number | null;
  readonly message: string | null;
  readonly testFailure: TestFailureDto | null;
}

/** What the new tests add, not the score a mutation tool prints. */
interface MutantCountsDto {
  readonly undetectedBefore: number;
  readonly killed: number;
  readonly reached: number;
}

/** A mutant the new tests still miss, as a place in the target. */
interface SurvivingMutantDto {
  readonly line: number;
  readonly mutator: string;
  readonly replacement: string;
  readonly reached: boolean;
}

/** The verdict of the gate on the patch of an attempt, with every check. */
export interface VerificationReportDto {
  readonly patchHash: string;
  readonly verdict: Verdict;
  readonly reasons: readonly string[];
  readonly checks: readonly CheckResultDto[];
  /** `null` when the gate stopped before it measured the target. */
  readonly coverageBefore: CoverageCountersDto | null;
  readonly coverageAfter: CoverageCountersDto | null;
  readonly mutants: MutantCountsDto | null;
  readonly survivingMutants: readonly SurvivingMutantDto[];
}

/** One try at generating a test, as a person sees it. */
export interface AttemptDto {
  readonly number: number;
  readonly status: 'open' | 'closed';
  readonly startedAt: Instant;
  readonly finishedAt: Instant | null;
  readonly generationOutcome: GenerationOutcome | null;
  readonly tokensUsed: number;
  readonly patchHash: string | null;
  readonly report: VerificationReportDto | null;
  /**
   * Where the instance keeps the raw output of the generator and of the
   * checks, in that order, as absolute paths a person can open. A file
   * that is gone keeps its path.
   */
  readonly rawOutputPaths: readonly string[];
}
