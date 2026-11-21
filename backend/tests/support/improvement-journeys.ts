import { Improvement } from '#improvement/domain/entities/improvement.entity';
import { ImprovementFailure } from '#improvement/domain/value-objects/improvement-failure.vo';
import { ImprovementSkip } from '#improvement/domain/value-objects/improvement-skip.vo';
import type { ImprovementStatus } from '#improvement/domain/value-objects/improvement-status.vo';
import { PullRequestRef } from '#improvement/domain/value-objects/pull-request-ref.vo';
import { SnapshotId } from '#improvement/domain/value-objects/snapshot-id.vo';
import { CommitSha } from '#kernel/primitives/commit-sha';
import {
  BASE_COMMIT,
  BASELINE_SNAPSHOT_ID,
  baselineOf,
  CREATED_AT,
  generatedOf,
  IMPROVEMENT_ID,
  improvementIdOf,
  minutesIn,
  reportOf,
  requestOf,
  type RequestSpec,
  windowSpentUntil,
} from '#tests/support/improvement-values';

/** The minute after the creation that each step of the main path takes. */
export const STEP_MINUTE = {
  started: 1,
  measured: 2,
  generating: 3,
  attemptOpened: 4,
  generated: 5,
  judged: 6,
  published: 7,
  windowOpens: 60,
};

type Step = (improvement: Improvement) => void;

const at = (step: keyof typeof STEP_MINUTE) => minutesIn(STEP_MINUTE[step]);

/** When the window of a journey to `waiting_for_limit` opens again. */
export const WINDOW_OPENS_AT = at('windowOpens');

const PULL_REQUEST_NUMBER = 42;

export function pullRequestOf(): PullRequestRef {
  return PullRequestRef.create({
    number: PULL_REQUEST_NUMBER,
    url: `https://github.com/acme/shop/pull/${String(PULL_REQUEST_NUMBER)}`,
  });
}

export function failureOf(): ImprovementFailure {
  return ImprovementFailure.create({
    reason: 'stale_snapshot',
    message: 'The target file changed on the default branch.',
  });
}

export function skipOf(): ImprovementSkip {
  return ImprovementSkip.create({
    reason: 'threshold_met',
    message: 'The fresh measurement is already above the threshold.',
  });
}

const TO_ANALYZING: readonly Step[] = [
  (improvement) => {
    improvement.startWork(at('started'));
  },
];

const TO_GENERATING: readonly Step[] = [
  ...TO_ANALYZING,
  (improvement) => {
    improvement.recordBaselineSnapshot(
      {
        id: SnapshotId.create(BASELINE_SNAPSHOT_ID),
        commit: CommitSha.create(BASE_COMMIT),
      },
      at('measured'),
    );
    improvement.recordVerificationBaseline(baselineOf(), at('measured'));
  },
  (improvement) => {
    improvement.startGenerating(at('generating'));
  },
];

const TO_AN_ATTEMPT: readonly Step[] = [
  ...TO_GENERATING,
  (improvement) => {
    improvement.openAttempt(at('attemptOpened'));
  },
];

const TO_VERIFYING: readonly Step[] = [
  ...TO_AN_ATTEMPT,
  (improvement) => {
    improvement.recordGeneration(generatedOf(), at('generated'));
  },
];

const TO_ACCEPTED: readonly Step[] = [
  ...TO_VERIFYING,
  (improvement) => {
    improvement.recordVerdict(reportOf('accepted'), at('judged'));
  },
];

const PATHS: Readonly<Record<ImprovementStatus, readonly Step[]>> = {
  created: [],
  analyzing: TO_ANALYZING,
  generating: TO_GENERATING,
  waiting_for_limit: [
    ...TO_AN_ATTEMPT,
    (improvement) => {
      improvement.recordGeneration(
        windowSpentUntil(WINDOW_OPENS_AT),
        at('generated'),
      );
    },
  ],
  verifying: TO_VERIFYING,
  awaiting_approval: TO_ACCEPTED,
  publishing: TO_ACCEPTED,
  completed: [
    ...TO_ACCEPTED,
    (improvement) => {
      improvement.recordPullRequest(pullRequestOf(), at('published'));
    },
  ],
  skipped: [
    ...TO_ANALYZING,
    (improvement) => {
      improvement.skipWith(skipOf(), at('measured'));
    },
  ],
  failed: [
    ...TO_ANALYZING,
    (improvement) => {
      improvement.fail(failureOf(), at('measured'));
    },
  ],
  cancelled: [
    (improvement) => {
      improvement.cancel(at('started'));
    },
  ],
};

export interface JourneySpec extends RequestSpec {
  readonly id?: string;
}

export function createdImprovement(spec: JourneySpec = {}): Improvement {
  return Improvement.create(
    improvementIdOf(spec.id ?? IMPROVEMENT_ID),
    requestOf(spec),
    CREATED_AT,
  );
}

/**
 * An improvement brought to a status along the main path, one minute a
 * step. `awaiting_approval` is reached in review mode, the rest in the
 * mode the spec names.
 */
export function improvementIn(
  status: ImprovementStatus,
  spec: JourneySpec = {},
): Improvement {
  const review = status === 'awaiting_approval';
  const improvement = createdImprovement(
    review ? { ...spec, mode: 'review' } : spec,
  );
  for (const step of PATHS[status]) {
    step(improvement);
  }
  return improvement;
}
