import { beforeEach, describe, expect, it } from 'vitest';

import type { StepResult } from '#improvement/application/commands/run-improvement/improvement-step';
import { publishPatchRequestOf } from '#improvement/application/commands/run-improvement/publication-request';
import { PublishingStep } from '#improvement/application/commands/run-improvement/publishing.step';
import type { Improvement } from '#improvement/domain/entities/improvement.entity';
import { InvalidTransitionError } from '#improvement/domain/errors/invalid-transition.error';
import { JobStoppedError } from '#ports/errors/job-stopped.error';
import {
  improvementIn,
  pullRequestOf,
} from '#tests/support/improvement-journeys';
import { ImprovementRunBench } from '#tests/support/improvement-run-bench';
import {
  BASE_COMMIT,
  patchOf,
  TARGET_FILE,
} from '#tests/support/improvement-values';
import {
  HEAD_COMMIT,
  type StandInPublisher,
  standInPublisher,
} from '#tests/support/improvement-verdict-stand-ins';

/** As much of a refusal as the failure keeps. */
const REASON_MAX_LENGTH = 2000;

let bench: ImprovementRunBench;
let publisher: StandInPublisher;
let step: PublishingStep;

beforeEach(() => {
  bench = new ImprovementRunBench();
  publisher = standInPublisher();
  step = new PublishingStep(publisher);
});

interface Published {
  readonly result: StepResult;
  readonly stored: Improvement;
}

/** Runs the step once on an improvement that publishes, as a handler would. */
async function published(): Promise<Published> {
  const run = await bench.runOf(improvementIn('publishing'));
  const result = await step.run(run);
  return { result, stored: await bench.stored() };
}

/** The sentence an improvement failed with, after a refused publication. */
async function refusedWith(reason: string): Promise<string | undefined> {
  publisher.publication = { outcome: 'refused', reason };
  const { result, stored } = await published();
  expect(result).toEqual({ next: 'continue' });
  expect(stored.failure?.reason).toBe('publish_failed');
  return stored.failure?.message;
}

describe('PublishingStep', () => {
  it('should do the work of publishing and fail with publish_failed', () => {
    expect(step.status).toBe('publishing');
    expect(step.faultReason).toBe('publish_failed');
  });

  describe.each(['current', 'unchanged'] as const)(
    'when the snapshot is %s',
    (assessment) => {
      it('should publish the accepted patch and complete with the pull request', async () => {
        publisher.assessment = assessment;

        const { result, stored } = await published();

        expect(result).toEqual({ next: 'continue' });
        expect(publisher.publications).toEqual([
          publishPatchRequestOf(improvementIn('publishing')),
        ]);
        expect(stored.status).toBe('completed');
        expect(stored.pullRequest?.equals(pullRequestOf())).toBe(true);
      });
    },
  );

  /**
   * The gate reads the files of a patch strictly and accepts none but new
   * plain test files, and the attempt keeps the text it read for good, so
   * what goes out is what the gate accepted and nothing else.
   */
  it('should publish the very text the gate accepted, as the attempt keeps it', async () => {
    const { stored } = await published();

    const accepted = stored.acceptedAttempt;
    expect(publisher.publications.map(({ patchText }) => patchText)).toEqual([
      accepted?.patch?.text,
    ]);
    expect(accepted?.report?.patchHash).toBe(accepted?.patch?.hash);
    expect(publisher.created).toEqual([]);
  });

  it('should ask whether the base commit is still current for the target', async () => {
    await published();

    const [assessed] = publisher.assessed;
    expect(assessed?.snapshotCommit.value).toBe(BASE_COMMIT);
    expect(assessed?.targetFile.value).toBe(TARGET_FILE);
  });

  describe('when the target changed on the default branch', () => {
    it('should fail with a stale snapshot and keep the accepted patch', async () => {
      publisher.assessment = 'stale';

      const { result, stored } = await published();

      expect(result).toEqual({ next: 'continue' });
      expect(publisher.publications).toEqual([]);
      expect(stored.failure?.reason).toBe('stale_snapshot');
      expect(stored.failure?.message).toBe(
        `The file ${TARGET_FILE} changed on the default branch between ` +
          `${BASE_COMMIT} and ${HEAD_COMMIT}, so the accepted patch was not ` +
          'published.',
      );
      expect(stored.acceptedAttempt?.patch?.equals(patchOf())).toBe(true);
    });
  });

  describe('when the base commit left the history of the default branch', () => {
    it('should fail with a stale snapshot', async () => {
      publisher.assessment = 'diverged';

      const { stored } = await published();

      expect(stored.failure?.reason).toBe('stale_snapshot');
      expect(stored.failure?.message).toContain('no longer an ancestor');
    });
  });

  describe('when publishing is refused', () => {
    it('should fail with the reason it was given', async () => {
      const message = await refusedWith(
        ' push declined by a rule of acme/shop \n',
      );

      expect(message).toBe(
        'Publishing the patch was refused: push declined by a rule of ' +
          'acme/shop',
      );
    });

    it('should keep a long reason short', async () => {
      const message = await refusedWith('x'.repeat(9000));

      expect(message).toBe(
        `Publishing the patch was refused: ` +
          `${'x'.repeat(REASON_MAX_LENGTH - 1)}…`,
      );
    });

    it('should say so when no reason came with it', async () => {
      const message = await refusedWith('  ');

      expect(message).toBe('Publishing the patch was refused.');
    });
  });

  describe('when the improvement has no accepted patch on a branch', () => {
    it('should refuse to run and ask nothing', async () => {
      const run = await bench.runOf(improvementIn('verifying'));

      await expect(step.run(run)).rejects.toBeInstanceOf(
        InvalidTransitionError,
      );

      expect(publisher.assessed).toEqual([]);
    });
  });

  describe('when the job is stopped', () => {
    it('should let the stop pass and save nothing', async () => {
      const run = await bench.runOf(improvementIn('publishing'));
      bench.context.stop('worker_shutdown');

      await expect(step.run(run)).rejects.toBeInstanceOf(JobStoppedError);

      expect((await bench.stored()).status).toBe('publishing');
    });
  });
});
