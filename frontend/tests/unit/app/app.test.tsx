import { cleanup } from 'ink-testing-library';
import { afterEach, describe, expect, it } from 'vitest';

import { ServiceUnreachableError } from '#api/service-unreachable-error';
import { KEYS, PATIENT, press } from '#tests/support/keys';
import {
  openedApp as opened,
  showApp as show,
} from '#tests/support/sample-app';
import { BUSY_HEALTH } from '#tests/support/sample-repositories';
import { frameOf } from '#tests/support/wide-terminal';
import type { TerminalSize } from '#theme/widths';

const TOO_SMALL: TerminalSize = { columns: 60, rows: 20 };
const SOCKET = '/tmp/service.sock';
const TWICE = 2;

afterEach(cleanup);

describe('App', () => {
  it('should open on the repositories, under the header', async () => {
    const { terminal } = await opened();

    const frame = frameOf(terminal);
    expect(frame).toContain('Repositories    Improvements    Service');
    expect(frame).toContain('example/payments');
    expect(frame).toContain(': commands    q quit    ? keys');
  });

  it('should count in the header what waits for the user', async () => {
    const { terminal } = await opened();

    expect(frameOf(terminal)).toContain('1 to review');
  });

  it('should go to a section on its digit', async () => {
    const { terminal } = await opened();

    await press(terminal, '2');
    expect(frameOf(terminal)).toContain('NEEDS YOU');
    await press(terminal, '3');
    expect(frameOf(terminal)).toContain('Storage and actions');
    await press(terminal, '1');
    expect(frameOf(terminal)).toContain('example/gateway');
  });

  it('should open the files of a repository, and come back', async () => {
    const { terminal } = await opened();

    await press(terminal, KEYS.enter);
    await expect
      .poll(() => frameOf(terminal), PATIENT)
      .toContain('Repositories › example/payments');
    await press(terminal, KEYS.escape);
    expect(frameOf(terminal)).toContain('row 1 of 4');
  });

  it('should lead from the improvements to a patch, and back', async () => {
    const { terminal } = await opened();

    await press(terminal, '2', KEYS.enter);
    await expect
      .poll(() => frameOf(terminal), PATIENT)
      .toContain('Improvement improvement-sum');
    await press(terminal, 'p');
    await expect.poll(() => frameOf(terminal), PATIENT).toContain('Evidence');
    await press(terminal, KEYS.escape);
    await expect
      .poll(() => frameOf(terminal), PATIENT)
      .toContain('Improvement improvement-sum');
    await press(terminal, KEYS.escape);
    expect(frameOf(terminal)).toContain('NEEDS YOU');
  });

  describe('when the commands are open', () => {
    it('should run the command that what is typed leaves', async () => {
      const { terminal } = await opened();

      await press(terminal, ':', 's', 'e', 'r');
      expect(frameOf(terminal)).toContain('› Go to Service');
      expect(frameOf(terminal)).not.toContain('Go to Repositories');
      await press(terminal, KEYS.enter);

      expect(frameOf(terminal)).toContain('Storage and actions');
      expect(frameOf(terminal)).not.toContain('Commands');
    });

    it('should give no key to the screen behind them', async () => {
      const { terminal, session } = await opened();

      await press(terminal, ':', '2', 's');

      expect(frameOf(terminal)).toContain(': 2s');
      expect(frameOf(terminal)).not.toContain('NEEDS YOU');
      expect(session.api.calls.map(({ method }) => method)).not.toContain(
        'startScan',
      );
    });

    it('should close on esc and give the keys back', async () => {
      const { terminal } = await opened();

      await press(terminal, ':', KEYS.escape, '2');

      expect(frameOf(terminal)).not.toContain('Commands');
      expect(frameOf(terminal)).toContain('NEEDS YOU');
    });
  });

  it('should show every key on ?, and close on esc', async () => {
    const { terminal } = await opened();

    await press(terminal, '?');
    expect(frameOf(terminal)).toContain('letters type, enter accepts');
    await press(terminal, KEYS.escape);

    expect(frameOf(terminal)).not.toContain('letters type');
  });

  describe('when the user quits', () => {
    it('should end with nothing to say while no work runs', async () => {
      const { terminal, log } = await opened();

      await press(terminal, 'q');

      expect(log.farewells).toEqual([undefined]);
    });

    it('should say which work keeps running', async () => {
      const { terminal, log } = await opened({
        scripted: { health: () => Promise.resolve(BUSY_HEALTH) },
      });

      await press(terminal, 'q');

      expect(log.farewells).toEqual([
        '2 improvements and 1 scan keep running. ' +
          'See them with: coverage-autopilot list',
      ]);
    });
  });

  describe('when the service stops answering', () => {
    it('should say so in the header and ask for it once', async () => {
      const { terminal, session, log } = show({
        scripted: {
          health: () => Promise.reject(new ServiceUnreachableError(SOCKET)),
        },
      });

      await expect
        .poll(() => frameOf(terminal), PATIENT)
        .toContain('service down');
      await expect
        .poll(
          () => session.api.calls.filter((call) => call.method === 'health'),
          PATIENT,
        )
        .toHaveLength(TWICE);
      expect(log.lost).toBe(1);
    });

    it('should say that the service is starting while it is reached', () => {
      const { terminal } = show({ reviving: true });

      expect(frameOf(terminal)).toContain('starting the service');
    });
  });

  describe('when the window is too small', () => {
    it('should ask for more room, and still quit on q', async () => {
      const { terminal, log } = show({ size: TOO_SMALL });

      expect(frameOf(terminal)).toContain('This window is too small');
      await press(terminal, 'q');

      expect(log.farewells).toHaveLength(1);
    });
  });
});
