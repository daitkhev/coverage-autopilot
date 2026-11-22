import { describe, expect, it } from 'vitest';

import { list } from '#commands/list';
import { answered, refused } from '#tests/support/fake-service-api';
import {
  type IoSettings,
  NOT_FOUND,
  type RecordingIo,
  recordingIo,
} from '#tests/support/sample-command-io';
import {
  IMPROVEMENT_BY_STATUS,
  IMPROVEMENT_LIST,
} from '#tests/support/sample-improvements';
import { REPOSITORY_LIST } from '#tests/support/sample-repositories';

const LIST = { name: 'list' } as const;

function listIo(settings: IoSettings = {}): RecordingIo {
  return recordingIo(
    {
      listImprovements: () => Promise.resolve(answered(IMPROVEMENT_LIST)),
      listRepositories: () => Promise.resolve(answered(REPOSITORY_LIST)),
    },
    settings,
  );
}

describe('list', () => {
  it('should print one aligned line for each improvement, with its repository', async () => {
    const io = listIo();

    await expect(list(LIST, io)).resolves.toBe(0);

    expect(io.printed).toMatchInlineSnapshot(`
      [
        "example/payments  ○ WAIT    improvement-refund    src/api/refund.ts        30s  waits for its repository",
        "example/payments  ⠋ RUN     improvement-entries   src/ledger/entries.ts    1s   analyzing",
        "example/payments  ⠋ RUN     improvement-tax       src/billing/tax.ts       1s   attempt 2 of 3, writing a test",
        "example/payments  ○ WAIT    improvement-discount  src/billing/discount.ts  1s   waits for the limit until 16:00",
        "example/payments  ⠋ RUN     improvement-invoice   src/billing/invoice.ts   1s   attempt 2 of 3, checking the patch",
        "example/payments  ? REVIEW  improvement-sum       src/billing/sum.ts       3h   approve the patch",
        "example/payments  ⠋ RUN     improvement-rounding  src/billing/rounding.ts  1s   publishing",
        "example/payments  ✓ DONE    improvement-currency  src/billing/currency.ts  45m  https://github.com/example/payments/pull/131",
        "example/payments  ✕ FAIL    improvement-webhook   src/api/webhook.ts       1s   3 attempts were rejected. (budget_exhausted)",
        "example/payments  – SKIP    improvement-ids       src/ids.ts               30s  The fresh measurement is already above the threshold. (threshold_met)",
        "example/payments  ■ CANCEL  improvement-retry     src/core/retry.ts        4m   cancelled 4m ago",
      ]
    `);
    expect(io.said).toEqual([]);
  });

  describe('when the terminal shows no Unicode', () => {
    it('should print the ASCII of every status', async () => {
      const io = listIo({ unicode: false });

      await list(LIST, io);

      expect(io.printed.map((line) => line.split('  ')[1])).toEqual([
        'o WAIT',
        '* RUN',
        '* RUN',
        'o WAIT',
        '* RUN',
        '? REVIEW',
        '* RUN',
        '+ DONE',
        'x FAIL',
        '- SKIP',
        '# CANCEL',
      ]);
    });
  });

  describe('when an improvement names a repository the list lacks', () => {
    it('should name it by its id', async () => {
      const io = recordingIo({
        listImprovements: () =>
          Promise.resolve(
            answered({ items: [IMPROVEMENT_BY_STATUS.analyzing] }),
          ),
        listRepositories: () => Promise.resolve(answered({ items: [] })),
      });

      await list(LIST, io);

      expect(io.printed).toEqual([
        'repository-payments  ⠋ RUN  improvement-entries  src/ledger/entries.ts  1s  analyzing',
      ]);
    });
  });

  describe('when the result is asked for as JSON', () => {
    it('should print the list of the contract as one document', async () => {
      const io = listIo({ json: true });

      await expect(list(LIST, io)).resolves.toBe(0);

      expect(io.printed).toEqual([JSON.stringify(IMPROVEMENT_LIST)]);
    });
  });

  describe('when the service refuses the improvements', () => {
    it('should say the refusal and ask for nothing more', async () => {
      const io = recordingIo({
        listImprovements: () => Promise.resolve(refused(404, NOT_FOUND)),
      });

      await expect(list(LIST, io)).resolves.toBe(1);

      expect(io.said).toEqual([JSON.stringify(NOT_FOUND)]);
      expect(io.session.api.calls).toHaveLength(1);
    });
  });

  describe('when the service refuses the repositories', () => {
    it('should say the refusal and print nothing', async () => {
      const io = recordingIo({
        listImprovements: () => Promise.resolve(answered(IMPROVEMENT_LIST)),
        listRepositories: () => Promise.resolve(refused(404, NOT_FOUND)),
      });

      await expect(list(LIST, io)).resolves.toBe(1);

      expect(io.printed).toEqual([]);
    });
  });
});
