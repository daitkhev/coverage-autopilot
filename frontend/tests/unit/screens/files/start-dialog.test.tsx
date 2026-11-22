import { cleanup } from 'ink-testing-library';
import { afterEach, describe, expect, it } from 'vitest';

import type { BudgetSettings } from '@coverage-autopilot/api-contracts/improvements';

import type { ServiceApi } from '#api/service-api';
import { StartDialog } from '#screens/files/start-dialog';
import {
  answered,
  fakeSession,
  refused,
} from '#tests/support/fake-service-api';
import { KEYS, PATIENT, press } from '#tests/support/keys';
import { IMPROVEMENT_BY_STATUS } from '#tests/support/sample-improvements';
import {
  ACCESS_PASSED,
  ACCESS_REFUSED,
  BUDGET_SETTINGS,
  PAYMENTS_SNAPSHOT,
  SCANNED_REPOSITORY,
} from '#tests/support/sample-repositories';
import { NARROW } from '#tests/support/sample-work-frame';
import { drawnWith, widestLine } from '#tests/support/terminal-text';
import { frameOf, renderAt } from '#tests/support/wide-terminal';

const STARTED = IMPROVEMENT_BY_STATUS.created;

/** A key paid for, so tokens have a limit of their own. */
const PAID_SETTINGS: BudgetSettings = {
  defaults: { attempts: 3, tokens: 200_000, minutes: 30 },
  maximums: { attempts: 6, tokens: 600_000, minutes: 60 },
};

function ready(more: Partial<ServiceApi> = {}): Partial<ServiceApi> {
  return {
    getBudgetSettings: () => Promise.resolve(answered(BUDGET_SETTINGS)),
    checkAccess: () => Promise.resolve(answered(ACCESS_PASSED)),
    startImprovement: () => Promise.resolve(answered(STARTED, 202)),
    ...more,
  };
}

function opened(scripted: Partial<ServiceApi>) {
  const log: string[] = [];
  const session = fakeSession(scripted);
  const dialog = (
    <StartDialog
      session={session}
      repositoryId={SCANNED_REPOSITORY.id}
      snapshotId={PAYMENTS_SNAPSHOT.id}
      filePath="src/billing/invoice.ts"
      onOpenImprovement={(id) => {
        log.push(`open ${id}`);
      }}
      onClose={() => {
        log.push('closed');
      }}
    />
  );
  const tree = <>{drawnWith({ animation: false }, dialog)}</>;
  return { terminal: renderAt(tree, NARROW), log, calls: session.api.calls };
}

async function openedReady(scripted: Partial<ServiceApi> = ready()) {
  const dialog = opened(scripted);
  await expect
    .poll(() => frameOf(dialog.terminal), PATIENT)
    .toContain('Attempts');
  return dialog;
}

function startCalls(calls: ReturnType<typeof opened>['calls']) {
  return calls.filter((call) => call.method === 'startImprovement');
}

afterEach(cleanup);

describe('StartDialog', () => {
  it('should check the access and read the limits before it offers a start', async () => {
    const { terminal, calls } = opened({
      getBudgetSettings: () => new Promise(() => undefined),
      checkAccess: () => new Promise(() => undefined),
    });

    await press(terminal, KEYS.enter);

    expect(frameOf(terminal)).toContain(
      'Checking the access and reading the limits',
    );
    expect(calls.map((call) => call.method)).toEqual([
      'getBudgetSettings',
      'checkAccess',
    ]);
  });

  it('should show the limits with their maximums, waiting for approval first', async () => {
    const { terminal } = await openedReady();

    expect(frameOf(terminal)).toMatchSnapshot();
    expect(widestLine(frameOf(terminal))).toBeLessThanOrEqual(NARROW.columns);
  });

  it('should change a limit by a step and keep it within its maximum', async () => {
    const { terminal } = await openedReady();

    await press(terminal, '+', '+', KEYS.right, KEYS.tab, '-', KEYS.left);
    expect(frameOf(terminal)).toContain('Attempts    6');
    expect(frameOf(terminal)).toContain('› Time        20 min');

    await press(terminal, KEYS.up, ...Array.from({ length: 12 }, () => '+'));
    expect(frameOf(terminal)).toContain('Attempts    10');

    await press(terminal, ...Array.from({ length: 12 }, () => '-'));
    expect(frameOf(terminal)).toContain('Attempts    1 ');
  });

  it('should change how the work is published', async () => {
    const { terminal, calls } = await openedReady();

    await press(terminal, KEYS.down, KEYS.down, KEYS.right, KEYS.enter);

    await expect.poll(() => startCalls(calls), PATIENT).toHaveLength(1);
    expect(startCalls(calls)[0]?.arguments[0]).toMatchObject({
      mode: 'automatic',
    });
  });

  describe('when tokens have a limit', () => {
    it('should offer it as a field of its own', async () => {
      const { terminal } = await openedReady(
        ready({
          getBudgetSettings: () => Promise.resolve(answered(PAID_SETTINGS)),
        }),
      );

      await press(terminal, KEYS.tab, '+');

      expect(frameOf(terminal)).toContain('› Tokens      210,000');
      expect(frameOf(terminal)).toContain('up to 600,000');
    });
  });

  describe('when enter starts the improvement', () => {
    it('should send the limits with a new key and open the work', async () => {
      const { terminal, calls, log } = await openedReady();

      await press(terminal, KEYS.enter);

      await expect.poll(() => log, PATIENT).toEqual([`open ${STARTED.id}`]);
      const [request, key] = startCalls(calls)[0]?.arguments ?? [];
      expect(request).toEqual({
        snapshotId: PAYMENTS_SNAPSHOT.id,
        filePath: 'src/billing/invoice.ts',
        mode: 'review',
        budget: { attempts: 3, tokens: null, minutes: 30 },
      });
      expect(key).toEqual(expect.any(String));
    });

    it('should start nothing on a second enter while the first runs', async () => {
      const { terminal, calls } = await openedReady(
        ready({ startImprovement: () => new Promise(() => undefined) }),
      );

      await press(terminal, KEYS.enter, KEYS.enter, KEYS.enter);

      expect(frameOf(terminal)).toContain('Starting the improvement');
      expect(startCalls(calls)).toHaveLength(1);
    });

    it('should offer to open the improvement a conflict names', async () => {
      const conflict = refused(409, {
        error: 'improvement_in_progress',
        message: 'The file is improved already.',
        improvementId: 'improvement-sum',
      });
      const { terminal, log } = await openedReady(
        ready({ startImprovement: () => Promise.resolve(conflict) }),
      );

      await press(terminal, KEYS.enter);
      await expect
        .poll(() => frameOf(terminal), PATIENT)
        .toContain('The file is improved already.  improvement_in_progress');
      expect(frameOf(terminal)).toContain('enter open it');

      await press(terminal, KEYS.enter);
      expect(log).toEqual(['open improvement-sum']);
    });

    it('should start again with a new key after a refusal', async () => {
      const refusal = refused(400, {
        error: 'invalid_request',
        message: 'The budget is too large.',
      });
      const { terminal, calls } = await openedReady(
        ready({ startImprovement: () => Promise.resolve(refusal) }),
      );

      await press(terminal, KEYS.enter);
      await expect
        .poll(() => frameOf(terminal), PATIENT)
        .toContain('The budget is too large.');
      await press(terminal, KEYS.enter);

      await expect.poll(() => startCalls(calls), PATIENT).toHaveLength(2);
      const [first, second] = startCalls(calls).map(
        (call) => call.arguments[1],
      );
      expect(first).not.toEqual(second);
    });

    it('should say when nothing answered the start', async () => {
      const { terminal } = await openedReady(
        ready({
          startImprovement: () => Promise.reject(new Error('Socket closed.')),
        }),
      );

      await press(terminal, KEYS.enter);

      await expect
        .poll(() => frameOf(terminal), PATIENT)
        .toContain('Nothing answered the start: Socket closed.');
    });
  });

  describe('when the preflight does not pass', () => {
    it('should give the reason and check again on enter', async () => {
      const { terminal, calls } = opened(
        ready({
          checkAccess: () => Promise.resolve(answered(ACCESS_REFUSED)),
        }),
      );

      await expect
        .poll(() => frameOf(terminal), PATIENT)
        .toContain('You are not logged into any hosts. Run: gh auth login');
      expect(frameOf(terminal)).toMatchSnapshot();

      await press(terminal, KEYS.enter);
      await expect
        .poll(
          () => calls.filter((call) => call.method === 'checkAccess'),
          PATIENT,
        )
        .toHaveLength(2);
    });

    it('should give a refusal of the service', async () => {
      const { terminal } = opened(
        ready({
          getBudgetSettings: () =>
            Promise.resolve(
              refused(500, { error: 'internal_error', message: 'Broken.' }),
            ),
        }),
      );

      await expect
        .poll(() => frameOf(terminal), PATIENT)
        .toContain('! Broken.  internal_error');
    });

    it('should give a refusal of the access check', async () => {
      const { terminal } = opened(
        ready({
          checkAccess: () =>
            Promise.resolve(
              refused(404, { error: 'not_found', message: 'No repository.' }),
            ),
        }),
      );

      await expect
        .poll(() => frameOf(terminal), PATIENT)
        .toContain('! No repository.  not_found');
    });

    it('should say when the service did not answer', async () => {
      const { terminal } = opened(
        ready({ checkAccess: () => Promise.reject(new Error('Gone.')) }),
      );

      await expect
        .poll(() => frameOf(terminal), PATIENT)
        .toContain('The service did not answer: Gone.');
    });
  });

  it('should close on esc', async () => {
    const { terminal, log } = await openedReady();

    await press(terminal, KEYS.escape);

    expect(log).toEqual(['closed']);
  });
});
