import { cleanup, render } from 'ink-testing-library';
import { afterEach, describe, expect, it } from 'vitest';

import type { ImprovementList } from '@coverage-autopilot/api-contracts/improvements';

import { ServiceUnreachableError } from '#api/service-unreachable-error';
import { ImprovementsScreen } from '#screens/improvements/improvements-screen';
import {
  answered,
  type FakeSession,
  fakeSession,
  refused,
} from '#tests/support/fake-service-api';
import { KEYS, PATIENT, press, screenOf } from '#tests/support/keys';
import { IMPROVEMENT_LIST } from '#tests/support/sample-improvements';
import { LIVE_SIZE, sampleFrame } from '#tests/support/sample-lists-frame';
import { REPOSITORY_LIST } from '#tests/support/sample-repositories';
import type { TerminalSize } from '#theme/widths';

const IMPROVEMENTS = 1;
const SOCKET = '/tmp/service.sock';

function sessionOf(list: ImprovementList = IMPROVEMENT_LIST): FakeSession {
  return fakeSession({
    listImprovements: () => Promise.resolve(answered(list)),
    listRepositories: () => Promise.resolve(answered(REPOSITORY_LIST)),
  });
}

/** Shows the screen, and the ids it was asked to open. */
function show(session: FakeSession, size: TerminalSize = LIVE_SIZE) {
  const opened: string[] = [];
  const terminal = render(
    <ImprovementsScreen
      session={session}
      frame={sampleFrame(size, IMPROVEMENTS)}
      onOpenImprovement={(id) => {
        opened.push(id);
      }}
    />,
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
      const size = { ...LIVE_SIZE, columns: 80 };
      const { terminal } = await shown(sessionOf(), size);

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
});
