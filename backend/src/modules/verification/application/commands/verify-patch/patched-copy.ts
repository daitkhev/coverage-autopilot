import type {
  DetectedProjectDto,
  WorkingCopyLoan,
} from '#coverage/application/contracts/coverage-public-api';
import type { FilePath } from '#kernel/primitives/file-path';
import type { CheckBook } from '#verification/application/commands/verify-patch/check-book';
import type { SharedTestRun } from '#verification/application/commands/verify-patch/shared-test-run';
import type { VerifyPatchCommand } from '#verification/application/commands/verify-patch/verify-patch.command';
import type {
  MutantCountsDto,
  SurvivingMutantDto,
  TargetCoverageDto,
} from '#verification/application/contracts/verification-public-api';
import type { Deadline } from '#verification/application/deadline';
import type { MutationToolResult } from '#verification/application/ports/mutation-runner.port';
import type { MutationBaseline } from '#verification/domain/value-objects/mutation-baseline.vo';
import type { QualityPolicy } from '#verification/domain/value-objects/quality-policy.vo';

/** What the report shows besides the checks, left by the check that saw it. */
export interface GateEvidence {
  coverage: {
    readonly before: TargetCoverageDto;
    readonly after: TargetCoverageDto;
  } | null;
  mutation: {
    readonly counts: MutantCountsDto;
    readonly surviving: readonly SurvivingMutantDto[];
  } | null;
}

/** A clean clone with the patch applied and its packages installed. */
export interface PatchedCopy {
  readonly command: VerifyPatchCommand;
  readonly policy: QualityPolicy;
  /** `null` when the baseline holds no measure of the mutants. */
  readonly mutationBaseline: MutationBaseline | null;
  readonly loan: WorkingCopyLoan;
  readonly testRunner: DetectedProjectDto['testRunner'];
  /**
   * How the install of the mutation tool ended, or `null` when the policy
   * does not require the mutation check and nothing was installed.
   */
  readonly mutationTool: MutationToolResult | null;
  /** The files of the patch: the only tests that were not there before. */
  readonly newTestFiles: readonly FilePath[];
  readonly deadline: Deadline;
  readonly book: CheckBook;
  readonly fullRun: SharedTestRun;
  readonly evidence: GateEvidence;
}
