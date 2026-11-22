import { beforeEach, describe, expect, it } from 'vitest';

import { ImprovementViews } from '#improvement/application/dto/improvement-views';
import { FixedClock } from '#tests/support/fixed-clock';
import {
  improvementIn,
  STEP_MINUTE,
} from '#tests/support/improvement-journeys';
import { IMPROVEMENT_ID, minutesIn } from '#tests/support/improvement-values';
import {
  type RecordingQueue,
  recordingQueue,
} from '#tests/support/recording-queue';

const NOW_MINUTE = 10;
const SECONDS_PER_MINUTE = 60;

const RUNNING_JOB = {
  jobId: 'job-1',
  steps: [{ code: 'type_check', status: 'running' }],
  updatedAt: minutesIn(9),
} as const;

let queue: RecordingQueue;
let views: ImprovementViews;

beforeEach(() => {
  queue = recordingQueue();
  views = new ImprovementViews(
    queue,
    new FixedClock(minutesIn(NOW_MINUTE).toString()),
  );
});

describe('ImprovementViews', () => {
  describe('of', () => {
    it('should count the work of the improvement up to the time of the clock', async () => {
      const shown = await views.of(improvementIn('generating'));

      expect(shown.id).toBe(IMPROVEMENT_ID);
      expect(shown.usage).toEqual({
        attempts: 0,
        tokens: 0,
        seconds: (NOW_MINUTE - STEP_MINUTE.started) * SECONDS_PER_MINUTE,
      });
    });

    it('should show the steps of the running job, and not the job', async () => {
      queue.progress = RUNNING_JOB;

      const shown = await views.of(improvementIn('verifying'));

      expect(shown.progress).toEqual({
        steps: RUNNING_JOB.steps,
        updatedAt: RUNNING_JOB.updatedAt,
      });
    });

    it('should show no steps when no worker runs it', async () => {
      expect((await views.of(improvementIn('analyzing'))).progress).toBeNull();
    });

    it.each([
      ['a free worker', 'worker', 'worker'],
      ['another job of its repository', 'repository', 'repository'],
      ['its moment', 'moment', null],
      ['nothing, as it runs', null, null],
    ] as const)(
      'should show a job that waits for %s',
      async (_wait, wait, shown) => {
        queue.wait = wait;

        expect((await views.of(improvementIn('created'))).waitingFor).toBe(
          shown,
        );
      },
    );

    it.each([
      ['awaiting_approval', 'worker', 'approval'],
      ['waiting_for_limit', 'moment', 'limit'],
      ['waiting_for_limit', null, 'limit'],
    ] as const)(
      'should show what an improvement that is %s waits for while its job waits for %s',
      async (status, wait, shown) => {
        queue.wait = wait;

        expect((await views.of(improvementIn(status))).waitingFor).toBe(shown);
      },
    );

    describe('when the window opened and the job waits for its repository', () => {
      it('should show the wait of the job, which holds the improvement now', async () => {
        queue.wait = 'repository';

        expect(
          (await views.of(improvementIn('waiting_for_limit'))).waitingFor,
        ).toBe('repository');
      });
    });

    it.each(['completed', 'skipped', 'failed', 'cancelled'] as const)(
      'should show no job of an improvement that is %s',
      async (status) => {
        queue.progress = RUNNING_JOB;

        const shown = await views.of(improvementIn(status));

        expect(shown.progress).toBeNull();
        expect(shown.waitingFor).toBeNull();
      },
    );
  });
});
