import { describe, expect, it } from 'vitest';

import { cancel } from '#commands/cancel';
import { answered, refused } from '#tests/support/fake-service-api';
import {
  expectRefusal,
  NOT_FOUND,
  recordingIo,
} from '#tests/support/sample-command-io';
import { IMPROVEMENT_BY_STATUS } from '#tests/support/sample-improvements';
import { SCAN_BY_STATUS } from '#tests/support/sample-repositories';

const ACCEPTED = 202;
const CANCELLED_IMPROVEMENT = IMPROVEMENT_BY_STATUS.cancelled;
const CANCELLED_SCAN = SCAN_BY_STATUS.cancelled;

describe('cancel', () => {
  describe('when the id is of an improvement', () => {
    it('should cancel it and print its new status', async () => {
      const io = recordingIo({
        cancelImprovement: () =>
          Promise.resolve(answered(CANCELLED_IMPROVEMENT, ACCEPTED)),
      });

      await expect(
        cancel({ name: 'cancel', id: 'improvement-retry' }, io),
      ).resolves.toBe(0);

      expect(io.session.api.calls).toEqual([
        { method: 'cancelImprovement', arguments: ['improvement-retry'] },
      ]);
      expect(io.printed).toEqual([
        '■ CANCEL  improvement-retry  src/core/retry.ts  4m  cancelled at 14:01',
      ]);
    });

    it('should print the improvement of the contract with --json', async () => {
      const io = recordingIo(
        {
          cancelImprovement: () =>
            Promise.resolve(answered(CANCELLED_IMPROVEMENT, ACCEPTED)),
        },
        { json: true },
      );

      await cancel({ name: 'cancel', id: 'improvement-retry' }, io);

      expect(io.printed).toEqual([JSON.stringify(CANCELLED_IMPROVEMENT)]);
    });
  });

  describe('when the id is of a scan', () => {
    it('should cancel the scan once no improvement has the id', async () => {
      const io = recordingIo({
        cancelImprovement: () => Promise.resolve(refused(404, NOT_FOUND)),
        cancelScan: () => Promise.resolve(answered(CANCELLED_SCAN, ACCEPTED)),
      });

      await expect(
        cancel({ name: 'cancel', id: 'scan-payments-0' }, io),
      ).resolves.toBe(0);

      expect(io.session.api.calls.map((call) => call.method)).toEqual([
        'cancelImprovement',
        'cancelScan',
      ]);
      expect(io.printed).toEqual(['■ CANCEL  scan-payments-0']);
      expect(io.said).toEqual([]);
    });

    it('should print the scan of the contract with --json', async () => {
      const io = recordingIo(
        {
          cancelImprovement: () => Promise.resolve(refused(404, NOT_FOUND)),
          cancelScan: () => Promise.resolve(answered(CANCELLED_SCAN)),
        },
        { json: true },
      );

      await cancel({ name: 'cancel', id: 'scan-payments-0' }, io);

      expect(io.printed).toEqual([JSON.stringify(CANCELLED_SCAN)]);
    });

    it('should print a scan that had failed as it is, with its reason', async () => {
      const io = recordingIo({
        cancelImprovement: () => Promise.resolve(refused(404, NOT_FOUND)),
        cancelScan: () =>
          Promise.resolve(answered(SCAN_BY_STATUS.failed, ACCEPTED)),
      });

      await expect(
        cancel({ name: 'cancel', id: 'scan-payments-1' }, io),
      ).resolves.toBe(0);

      expect(io.printed).toEqual([
        '✕ FAIL  scan-payments-1  The packages of the project could not be installed. (install_failed)',
      ]);
    });
  });

  describe('when neither has the id', () => {
    it('should say the refusal of the scan once and end with 1', async () => {
      const io = recordingIo({
        cancelImprovement: () => Promise.resolve(refused(404, NOT_FOUND)),
        cancelScan: () => Promise.resolve(refused(404, NOT_FOUND)),
      });

      await expect(cancel({ name: 'cancel', id: 'gone' }, io)).resolves.toBe(1);

      expectRefusal(io, NOT_FOUND);
    });
  });

  describe('when the service refuses the cancel for another reason', () => {
    it('should say that refusal and try no scan', async () => {
      const failure = {
        error: 'internal_error',
        message: 'The service failed.',
      } as const;
      const io = recordingIo({
        cancelImprovement: () => Promise.resolve(refused(500, failure)),
      });

      await expect(
        cancel({ name: 'cancel', id: 'improvement-retry' }, io),
      ).resolves.toBe(1);

      expect(io.said).toEqual([JSON.stringify(failure)]);
      expect(io.session.api.calls).toHaveLength(1);
    });
  });
});
