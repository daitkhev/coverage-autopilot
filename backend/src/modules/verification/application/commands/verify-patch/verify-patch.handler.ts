import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '#kernel/time/clock';
import { CheckBook } from '#verification/application/commands/verify-patch/check-book';
import { TestFilesOnlyCheck } from '#verification/application/commands/verify-patch/checks/test-files-only-check';
import { PatchVerification } from '#verification/application/commands/verify-patch/patch-verification';
import type { GateEvidence } from '#verification/application/commands/verify-patch/patched-copy';
import { reportOf } from '#verification/application/commands/verify-patch/verification-report';
import type { VerifyPatchCommand } from '#verification/application/commands/verify-patch/verify-patch.command';
import type { VerificationReportDto } from '#verification/application/contracts/verification-public-api';
import { Deadline } from '#verification/application/deadline';
import { mutationBaselineOf } from '#verification/application/dto/verification-dto-mapping';
import { BaselineMismatchError } from '#verification/application/errors/baseline-mismatch.error';
import { Stopwatch } from '#verification/application/stopwatch';
import type { MutationBaseline } from '#verification/domain/value-objects/mutation-baseline.vo';
import { QualityPolicy } from '#verification/domain/value-objects/quality-policy.vo';

function ignore(): void {
  // A caller that does not watch the checks gives no observer.
}

/** The measure of the mutants of a baseline that belongs to the patch. */
function mutationBaselineFor(
  command: VerifyPatchCommand,
): MutationBaseline | null {
  const { baseline, baseCommit, targetFile } = command;
  if (
    !baseline.commit.equals(baseCommit) ||
    !baseline.targetFile.equals(targetFile)
  ) {
    throw new BaselineMismatchError(
      `The baseline measures ${baseline.targetFile.value} at ${baseline.commit.value}, ` +
        `and the patch is for ${targetFile.value} at ${baseCommit.value}.`,
    );
  }
  return baseline.mutation === null
    ? null
    : mutationBaselineOf(baseline.mutation);
}

/**
 * Verifies one patch against the baseline of its commit. The module stores
 * nothing: the caller keeps the report, and never retries through it.
 */
@Injectable()
export class VerifyPatchHandler {
  private readonly testFilesOnly: TestFilesOnlyCheck;
  private readonly verification: PatchVerification;
  private readonly clock: Clock;

  public constructor(
    @Inject(TestFilesOnlyCheck) testFilesOnly: TestFilesOnlyCheck,
    @Inject(PatchVerification) verification: PatchVerification,
    @Inject(CLOCK) clock: Clock,
  ) {
    this.testFilesOnly = testFilesOnly;
    this.verification = verification;
    this.clock = clock;
  }

  public async execute(
    command: VerifyPatchCommand,
    signal: AbortSignal,
  ): Promise<VerificationReportDto> {
    const policy = QualityPolicy.create(command.policy);
    const mutationBaseline = mutationBaselineFor(command);
    const book = new CheckBook(command.onProgress ?? ignore);
    const evidence: GateEvidence = { coverage: null, mutation: null };
    const stopwatch = Stopwatch.started(this.clock);
    book.begin(this.testFilesOnly.name);
    const reading = this.testFilesOnly.read(command);
    if (reading.outcome === 'refused') {
      book.record(reading.result.withDuration(stopwatch.elapsedMs()));
      this.verification.refuse(book, policy);
    } else {
      const deadline = new Deadline(this.clock, command.deadline);
      const { files } = reading;
      await this.verification.verify(
        {
          command,
          policy,
          mutationBaseline,
          files,
          deadline,
          book,
          evidence,
          stopwatch,
        },
        signal,
      );
    }
    return reportOf({ command, policy, book, evidence });
  }
}
