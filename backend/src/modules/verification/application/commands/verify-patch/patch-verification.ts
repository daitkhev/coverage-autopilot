import { Inject, Injectable } from '@nestjs/common';

import {
  COVERAGE_PUBLIC_API,
  type CoveragePublicApi,
  type DetectedProjectDto,
  type PrepareProjectResult,
  type WorkingCopyLoan,
} from '#coverage/application/contracts/coverage-public-api';
import type { FilePath } from '#kernel/primitives/file-path';
import {
  REPOSITORIES_PUBLIC_API,
  type RepositoriesPublicApi,
  type WorkingCopyDto,
} from '#repositories/application/contracts/repositories-public-api';
import type { CheckBook } from '#verification/application/commands/verify-patch/check-book';
import { CheckSequence } from '#verification/application/commands/verify-patch/check-sequence';
import { TestFilesOnlyCheck } from '#verification/application/commands/verify-patch/checks/test-files-only-check';
import type {
  GateEvidence,
  PatchedCopy,
} from '#verification/application/commands/verify-patch/patched-copy';
import { SharedTestRun } from '#verification/application/commands/verify-patch/shared-test-run';
import type { VerifyPatchCommand } from '#verification/application/commands/verify-patch/verify-patch.command';
import type { Deadline } from '#verification/application/deadline';
import {
  MUTATION_RUNNER,
  type MutationRunner,
  type MutationToolResult,
} from '#verification/application/ports/mutation-runner.port';
import type { Stopwatch } from '#verification/application/stopwatch';
import {
  type CheckName,
  CheckResult,
} from '#verification/domain/value-objects/check-result.vo';
import type { MutationBaseline } from '#verification/domain/value-objects/mutation-baseline.vo';
import type { QualityPolicy } from '#verification/domain/value-objects/quality-policy.vo';

/** A patch whose text passed the first half of the first check. */
export interface Verification {
  readonly command: VerifyPatchCommand;
  readonly policy: QualityPolicy;
  readonly mutationBaseline: MutationBaseline | null;
  /** The test files the text adds. */
  readonly files: readonly FilePath[];
  readonly deadline: Deadline;
  readonly book: CheckBook;
  readonly evidence: GateEvidence;
  /** Started with the first check, which ends once the patch is applied. */
  readonly stopwatch: Stopwatch;
}

/** A copy with the patch applied and its packages installed. */
interface Prepared {
  readonly loan: WorkingCopyLoan;
  readonly testRunner: DetectedProjectDto['testRunner'];
}

const NOT_APPLIED =
  'The patch did not pass the check of test files, so it was not applied.';

function notApplied(name: CheckName): CheckResult {
  return CheckResult.notApplicable(name, NOT_APPLIED);
}

/**
 * The commit installed for the baseline, and a patch only adds test files,
 * so a failed install is most likely the network and worth another try. A
 * project that is no longer supported stays so.
 */
function unpreparedResultOf(
  preparation: Exclude<PrepareProjectResult, { outcome: 'ready' }>,
): (name: CheckName) => CheckResult {
  return (name) =>
    preparation.outcome === 'unsupported'
      ? CheckResult.error(name, {
          message: `The project cannot be verified with the patch: ${preparation.detail}`,
          retryable: false,
        })
      : CheckResult.error(name, {
          message:
            'The packages of the project did not install with the patch.',
          retryable: true,
          outputReference: preparation.outputReference,
        });
}

/**
 * Applies a patch to a clean clone of its commit, installs the packages
 * and, when the policy requires the mutation check, the mutation tool, and
 * runs the checks in it. The copy is disposed of on every path: a result, a
 * fault and a stop all release it.
 */
@Injectable()
export class PatchVerification {
  private readonly repositories: RepositoriesPublicApi;
  private readonly coverage: CoveragePublicApi;
  private readonly mutationRunner: MutationRunner;
  private readonly testFilesOnly: TestFilesOnlyCheck;
  private readonly sequence: CheckSequence;

  public constructor(
    @Inject(REPOSITORIES_PUBLIC_API) repositories: RepositoriesPublicApi,
    @Inject(COVERAGE_PUBLIC_API) coverage: CoveragePublicApi,
    @Inject(MUTATION_RUNNER) mutationRunner: MutationRunner,
    @Inject(TestFilesOnlyCheck) testFilesOnly: TestFilesOnlyCheck,
    @Inject(CheckSequence) sequence: CheckSequence,
  ) {
    this.repositories = repositories;
    this.coverage = coverage;
    this.mutationRunner = mutationRunner;
    this.testFilesOnly = testFilesOnly;
    this.sequence = sequence;
  }

  /** Records every check but the first as having nothing to examine. */
  public refuse(book: CheckBook, policy: QualityPolicy): void {
    this.sequence.notRun({ book, policy, resultOf: notApplied });
  }

  public async verify(
    verification: Verification,
    signal: AbortSignal,
  ): Promise<void> {
    const { command } = verification;
    const copy = await this.repositories.createWorkingCopy(
      {
        repositoryId: command.repositoryId,
        commit: command.baseCommit,
        purpose: `verification:patch:${command.owner}`,
      },
      signal,
    );
    try {
      await this.verifyIn(verification, copy, signal);
    } finally {
      await this.repositories.disposeWorkingCopy({ workingCopyId: copy.id });
    }
  }

  private async verifyIn(
    verification: Verification,
    copy: WorkingCopyDto,
    signal: AbortSignal,
  ): Promise<void> {
    const { command, book, policy } = verification;
    const applied = await this.testFilesOnly.apply({
      workingCopyId: copy.id,
      patchText: command.patch.text,
      files: verification.files,
    });
    book.record(applied.withDuration(verification.stopwatch.elapsedMs()));
    if (applied.status !== 'passed') {
      this.refuse(book, policy);
      return;
    }
    const loan = {
      workingCopyPath: copy.path,
      repositoryId: copy.repositoryId,
      owner: command.owner,
    };
    const preparation = await this.coverage.prepareProject(loan, signal);
    if (preparation.outcome !== 'ready') {
      const resultOf = unpreparedResultOf(preparation);
      this.sequence.notRun({ book, policy, resultOf });
      return;
    }
    const prepared = { loan, testRunner: preparation.project.testRunner };
    const mutationTool = await this.installTool(policy, prepared, signal);
    await this.sequence.run(
      this.copyOf(verification, { ...prepared, mutationTool }),
      signal,
    );
  }

  /**
   * The install of the mutation tool is the one step with an open network,
   * so it comes before any check runs code of the repository in the copy.
   */
  private async installTool(
    policy: QualityPolicy,
    prepared: Prepared,
    signal: AbortSignal,
  ): Promise<MutationToolResult | null> {
    return policy.requires('mutation_gain')
      ? this.mutationRunner.installTool(
          { ...prepared.loan, testRunner: prepared.testRunner },
          signal,
        )
      : null;
  }

  private copyOf(
    verification: Verification,
    prepared: Prepared & {
      readonly mutationTool: MutationToolResult | null;
    },
  ): PatchedCopy {
    const { loan } = prepared;
    const withCoverage = verification.policy.requires('coverage_increase');
    return {
      ...verification,
      ...prepared,
      newTestFiles: verification.files,
      fullRun: new SharedTestRun(async (signal) =>
        this.coverage.runTests(
          { ...loan, testFiles: [], withCoverage },
          signal,
        ),
      ),
    };
  }
}
