import type {
  Attempt,
  VerificationReport,
} from '@coverage-autopilot/api-contracts/attempts';
import type { Improvement } from '@coverage-autopilot/api-contracts/improvements';
import type { Progress } from '@coverage-autopilot/api-contracts/progress';

import type {
  AttemptDto,
  VerificationReportDto,
} from '#improvement/application/dto/attempt.dto';
import type {
  ImprovementDto,
  ProgressDto,
} from '#improvement/application/dto/improvement.dto';
import type { Instant } from '#kernel/time/instant';

/** The one text of a moment, or `null` for none. */
function momentOf(instant: Instant | null): string | null {
  return instant === null ? null : instant.toString();
}

function reportAnswerOf(report: VerificationReportDto): VerificationReport {
  return {
    ...report,
    reasons: [...report.reasons],
    checks: [...report.checks],
    survivingMutants: [...report.survivingMutants],
  };
}

function attemptAnswerOf(attempt: AttemptDto): Attempt {
  const { report } = attempt;
  return {
    number: attempt.number,
    status: attempt.status,
    startedAt: attempt.startedAt.toString(),
    finishedAt: momentOf(attempt.finishedAt),
    generationOutcome: attempt.generationOutcome,
    tokensUsed: attempt.tokensUsed,
    patchHash: attempt.patchHash,
    report: report === null ? null : reportAnswerOf(report),
    rawOutputPaths: [...attempt.rawOutputPaths],
  };
}

function progressAnswerOf(progress: ProgressDto | null): Progress | null {
  return progress === null
    ? null
    : { steps: [...progress.steps], updatedAt: progress.updatedAt.toString() };
}

/** An improvement in the words of the contract: ids, paths and moments as text. */
export function improvementAnswerOf(improvement: ImprovementDto): Improvement {
  const { qualityPolicy } = improvement;
  return {
    id: improvement.id,
    repositoryId: improvement.repositoryId.value,
    sourceSnapshotId: improvement.sourceSnapshotId,
    baselineSnapshotId: improvement.baselineSnapshotId,
    baseCommit: improvement.baseCommit.value,
    targetFile: improvement.targetFile.value,
    status: improvement.status,
    mode: improvement.mode,
    waitingFor: improvement.waitingFor,
    phaseStartedAt: improvement.phaseStartedAt.toString(),
    budget: improvement.budget,
    usage: improvement.usage,
    deadlineAt: momentOf(improvement.deadlineAt),
    resumesAt: momentOf(improvement.resumesAt),
    limitWaits: improvement.limitWaits,
    qualityPolicy: {
      ...qualityPolicy,
      requiredChecks: [...qualityPolicy.requiredChecks],
    },
    generator: improvement.generator,
    attempts: improvement.attempts.map(attemptAnswerOf),
    progress: progressAnswerOf(improvement.progress),
    branch: improvement.branch,
    pullRequest: improvement.pullRequest,
    failure: improvement.failure,
    skip: improvement.skip,
    createdAt: improvement.createdAt.toString(),
    updatedAt: improvement.updatedAt.toString(),
    cancelledAt: momentOf(improvement.cancelledAt),
  };
}
