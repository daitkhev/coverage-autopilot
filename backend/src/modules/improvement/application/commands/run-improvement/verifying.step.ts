import { Inject, Injectable } from '@nestjs/common';

import type { ImprovementRun } from '#improvement/application/commands/run-improvement/improvement-run';
import type {
  ImprovementStep,
  StepResult,
} from '#improvement/application/commands/run-improvement/improvement-step';
import { verificationReportOf } from '#improvement/application/commands/run-improvement/verification-mapping';
import { VerificationProgress } from '#improvement/application/commands/run-improvement/verification-progress';
import { verifyPatchRequestOf } from '#improvement/application/commands/run-improvement/verification-request';
import { followUpOf } from '#improvement/application/commands/run-improvement/verification-verdict';
import {
  IMPROVEMENT_SETTINGS,
  type ImprovementSettings,
} from '#improvement/application/improvement-settings';
import {
  VERIFICATION_PUBLIC_API,
  type VerificationPublicApi,
  type VerifyPatchRequest,
} from '#verification/application/contracts/verification-public-api';

/** The one setting the step reads. */
type VerifyingSettings = Pick<ImprovementSettings, 'testFileSuffixes'>;

/**
 * Runs the quality gate on the stored patch of the open attempt and keeps
 * its report with the attempt. The aggregate follows an accepted or a
 * rejected verdict. An inconclusive one is verified again or fails the
 * improvement, and its report is saved either way.
 */
@Injectable()
export class VerifyingStep implements ImprovementStep {
  public readonly status = 'verifying';
  public readonly faultReason = 'verification_error';
  private readonly verification: VerificationPublicApi;
  private readonly settings: VerifyingSettings;

  public constructor(
    @Inject(VERIFICATION_PUBLIC_API) verification: VerificationPublicApi,
    @Inject(IMPROVEMENT_SETTINGS) settings: VerifyingSettings,
  ) {
    this.verification = verification;
    this.settings = settings;
  }

  public async run(run: ImprovementRun): Promise<StepResult> {
    const progress = new VerificationProgress((steps) => {
      run.reportProgress(steps);
    });
    const request = this.requestOf(run, progress);
    progress.begin();
    const report = verificationReportOf(
      await this.verification.verifyPatch(request, run.signal),
    );
    const followUp = followUpOf(report, run.improvement.request.policy);
    await run.save((improvement, at) => {
      improvement.recordVerdict(report, at);
      if (followUp.failure !== null) {
        improvement.fail(followUp.failure, at);
      }
    });
    progress.end();
    return followUp.result;
  }

  private requestOf(
    run: ImprovementRun,
    progress: VerificationProgress,
  ): VerifyPatchRequest {
    return verifyPatchRequestOf(run.improvement, {
      owner: run.owner,
      testFileSuffixes: this.settings.testFileSuffixes,
      onProgress: (heard) => {
        progress.heard(heard);
      },
    });
  }
}
