import { cleanup } from 'ink-testing-library';
import { afterEach, describe, expect, it } from 'vitest';

import type {
  Improvement,
  ImprovementList,
} from '@coverage-autopilot/api-contracts/improvements';

import type { ServiceAnswer } from '#api/service-api';
import { ServiceUnreachableError } from '#api/service-unreachable-error';
import { ImprovementsScreen } from '#screens/improvements/improvements-screen';
import {
  answered,
  type FakeSession,
  fakeSession,
  refused,
} from '#tests/support/fake-service-api';
import { KEYS, PATIENT, press, screenOf } from '#tests/support/keys';
import {
  NARROW,
  sampleFrame,
  SECTION,
  SIZES,
  WIDE,
} from '#tests/support/sample-frame';
import {
  IMPROVEMENT_BY_STATUS,
  IMPROVEMENT_LIST,
} from '#tests/support/sample-improvements';
import { REPOSITORY_LIST } from '#tests/support/sample-repositories';
import { widestLine } from '#tests/support/terminal-text';
import { renderAt } from '#tests/support/wide-terminal';
import type { TerminalSize } from '#theme/widths';

const SOCKET = '/tmp/service.sock';

function sessionOf(list: ImprovementList = IMPROVEMENT_LIST): FakeSession {
  return fakeSession({
    listImprovements: () => Promise.resolve(answered(list)),
    listRepositories: () => Promise.resolve(answered(REPOSITORY_LIST)),
  });
}

/** A list whose work the service cancels with the answer given. */
function cancelling(
  answer: ServiceAnswer<Improvement> = answered(
    IMPROVEMENT_BY_STATUS.cancelled,
    202,
  ),
): FakeSession {
  return fakeSession({
    listImprovements: () => Promise.resolve(answered(IMPROVEMENT_LIST)),
    listRepositories: () => Promise.resolve(answered(REPOSITORY_LIST)),
    cancelImprovement: () => Promise.resolve(answer),
  });
}

/** Shows the screen, and the ids it was asked to open. */
function show(session: FakeSession, size: TerminalSize = WIDE) {
  const opened: string[] = [];
  const terminal = renderAt(
    <ImprovementsScreen
      session={session}
      frame={sampleFrame(size, SECTION.improvements)}
      onOpenImprovement={(id) => {
        opened.push(id);
      }}
    />,
    size,
  );
  return { terminal, opened };
}

async function shown(session: FakeSession, size?: TerminalSize) {
  const screen = show(session, size);
  await expect
    .poll(() => screenOf(screen.terminal), PATIENT)
    .toContain('src/billing/sum.ts');
  return screen;
}

afterEach(cleanup);

describe('ImprovementsScreen', () => {
  it('should show every improvement under what it needs', async () => {
    const { terminal } = await shown(sessionOf());

    expect(screenOf(terminal)).toContain('NEEDS YOU 1');
    expect(screenOf(terminal)).toContain(
      'example/payments · approve the patch',
    );
    expect(screenOf(terminal)).toContain('row 1 of 11');
  });

  it('should open the chosen improvement on enter', async () => {
    const { terminal, opened } = await shown(sessionOf());

    await press(terminal, KEYS.down, KEYS.enter);

    expect(opened).toEqual(['improvement-entries']);
  });

  it('should move through the list with the keys of a list', async () => {
    const { terminal, opened } = await shown(sessionOf());

    await press(terminal, 'G', KEYS.enter, 'g', 'j', 'j', 'k', KEYS.enter);

    expect(opened).toEqual(['improvement-retry', 'improvement-entries']);
    expect(screenOf(terminal)).toContain('row 2 of 11');
  });

  describe('when the details have the focus', () => {
    it('should not move the list, and still open on enter', async () => {
      const { terminal, opened } = await shown(sessionOf());

      await press(terminal, KEYS.tab, KEYS.down, KEYS.enter);

      expect(opened).toEqual(['improvement-sum']);
    });
  });

  describe('when the window has room for one panel', () => {
    it('should show the chosen improvement in its place and back', async () => {
      const { terminal } = await shown(sessionOf(), NARROW);

      await press(terminal, KEYS.right);
      expect(screenOf(terminal)).toContain('WAITING FOR YOU');
      expect(screenOf(terminal)).not.toContain('NEEDS YOU');

      await press(terminal, KEYS.left);
      expect(screenOf(terminal)).toContain('NEEDS YOU');
    });
  });

  describe('when there is no improvement', () => {
    it('should open nothing on enter', async () => {
      const { terminal, opened } = show(sessionOf({ items: [] }));
      await expect
        .poll(() => screenOf(terminal), PATIENT)
        .toContain('No improvements yet.');

      await press(terminal, KEYS.enter);

      expect(opened).toEqual([]);
    });
  });

  describe('when the service refuses the list', () => {
    it('should show what it refused with', async () => {
      const { terminal } = show(
        fakeSession({
          listImprovements: () =>
            Promise.resolve(
              refused(500, {
                error: 'internal_error',
                message: 'The list could not be read.',
              }),
            ),
          listRepositories: () =>
            Promise.resolve(
              refused(500, {
                error: 'internal_error',
                message: 'The list could not be read.',
              }),
            ),
        }),
      );

      await expect
        .poll(() => screenOf(terminal), PATIENT)
        .toContain('THE SERVICE ANSWERED');
    });
  });

  describe('when the list of repositories is refused', () => {
    it('should name a repository by its id', async () => {
      const { terminal } = show(
        fakeSession({
          listImprovements: () => Promise.resolve(answered(IMPROVEMENT_LIST)),
          listRepositories: () =>
            Promise.resolve(
              refused(500, { error: 'internal_error', message: 'Down.' }),
            ),
        }),
      );

      await expect
        .poll(() => screenOf(terminal), PATIENT)
        .toContain('repository-payments · approve the patch');
    });
  });

  describe('when the service does not answer', () => {
    it('should say so in the status line and show no fault', async () => {
      const { terminal } = show(
        fakeSession({
          listImprovements: () =>
            Promise.reject(new ServiceUnreachableError(SOCKET)),
          listRepositories: () =>
            Promise.reject(new ServiceUnreachableError(SOCKET)),
        }),
      );

      await expect
        .poll(() => screenOf(terminal), PATIENT)
        .toContain('! no answer yet');
      expect(screenOf(terminal)).not.toContain('THE CLIENT SAID');
    });
  });

  describe('when a request throws a fault', () => {
    it('should show the fault', async () => {
      const { terminal } = show(
        fakeSession({
          listImprovements: () =>
            Promise.reject(new TypeError('The answer does not match.')),
          listRepositories: () => Promise.resolve(answered(REPOSITORY_LIST)),
        }),
      );

      await expect
        .poll(() => screenOf(terminal), PATIENT)
        .toContain('THE CLIENT SAID');
    });
  });

  describe('when the chosen work is cancelled', () => {
    it('should ask first, and cancel the work on the second answer', async () => {
      const session = cancelling();
      const { terminal } = await shown(session);

      await press(terminal, 'c');
      expect(screenOf(terminal)).toContain('Cancel this improvement?');
      expect(screenOf(terminal)).toContain('esc keep');
      await press(terminal, KEYS.down, KEYS.enter);

      await expect
        .poll(() => screenOf(terminal), PATIENT)
        .not.toContain('Cancel this improvement?');
      const cancel = session.api.calls.find(
        ({ method }) => method === 'cancelImprovement',
      );
      expect(cancel?.arguments).toEqual(['improvement-sum']);
    });

    it('should keep the work on esc, and give the list no key meanwhile', async () => {
      const session = cancelling();
      const { terminal } = await shown(session);

      await press(terminal, 'c', 'f', KEYS.escape);

      expect(screenOf(terminal)).not.toContain('Cancel this improvement?');
      expect(screenOf(terminal)).not.toContain('only created');
      expect(session.api.calls.map(({ method }) => method)).not.toContain(
        'cancelImprovement',
      );
    });

    it('should keep the question open with what the service refused', async () => {
      const session = cancelling(
        refused(409, { error: 'status_conflict', message: 'It has ended.' }),
      );
      const { terminal } = await shown(session);

      await press(terminal, 'c', KEYS.down, KEYS.enter);

      await expect
        .poll(() => screenOf(terminal), PATIENT)
        .toContain('It has ended.');
      expect(screenOf(terminal)).toContain('Cancel this improvement?');
    });

    it('should offer no cancel for work that has ended', async () => {
      const session = cancelling();
      const { terminal } = await shown(session);

      await press(terminal, 'G', 'c');

      expect(screenOf(terminal)).not.toContain('c cancel');
      expect(screenOf(terminal)).not.toContain('Cancel this improvement?');
    });

    it.each(SIZES)(
      'should fit the question in $columns by $rows',
      async (size) => {
        const { terminal } = await shown(cancelling(), size);

        await press(terminal, 'c');

        const drawn = screenOf(terminal);
        expect(drawn).toContain('Cancel this improvement?');
        expect(widestLine(drawn)).toBeLessThanOrEqual(size.columns);
        expect(drawn.split('\n').length).toBeLessThanOrEqual(size.rows);
      },
    );
  });
});
