import { afterEach, describe, expect, it } from 'vitest';

import {
  type ImprovementWorld,
  improvementWorld,
} from '#tests/support/improvement-module-world';
import {
  checkOf,
  failedRunReportProps,
  reportPropsOf,
  RUN_FAILURE,
} from '#tests/support/improvement-values';

let world: ImprovementWorld | undefined;

afterEach(async () => {
  await world?.close();
  world = undefined;
});

describe('ImprovementModule', () => {
  describe('when the gate rejects the first patch because its tests failed', () => {
    it('should tell the generator why and what the run said first, and accept the second attempt', async () => {
      world = await improvementWorld();
      const { work, generator, gate, start, read } = world;
      gate.answers.push(failedRunReportProps());
      const { id } = await start();

      await work();

      const done = await read(id);
      expect(done.status).toBe('completed');
      expect(done.attempts.map((attempt) => attempt.report?.verdict)).toEqual([
        'rejected',
        'accepted',
      ]);
      expect(generator.requests.map((request) => request.feedback)).toEqual([
        null,
        expect.objectContaining({
          reasons: ['The new test does not pass.'],
          testFailure: RUN_FAILURE,
        }),
      ]);
    });
  });

  describe('when the gate refuses the files of every patch', () => {
    it('should publish none of them', async () => {
      world = await improvementWorld();
      const { work, gate, publisher, start, read } = world;
      const reason = 'The patch adds .gitattributes, not a test file.';
      const refused = {
        ...reportPropsOf('rejected'),
        reasons: [reason],
        checks: [
          { ...checkOf('test_files_only', 'rejected'), message: reason },
        ],
      };
      gate.answers.push(refused, refused, refused);
      const { id } = await start();

      await work();

      expect(publisher.publications).toEqual([]);
      expect(await read(id)).toMatchObject({
        status: 'failed',
        failure: { reason: 'budget_exhausted' },
      });
    });
  });
});
