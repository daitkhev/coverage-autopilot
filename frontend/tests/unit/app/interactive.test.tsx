import { describe, expect, it } from 'vitest';

import { runScreens } from '#app/interactive';
import { fakeTerminal } from '#tests/support/fake-terminal';
import { PATIENT } from '#tests/support/keys';
import { wholeSession } from '#tests/support/sample-app-session';
import { BUSY_HEALTH, IDLE_HEALTH } from '#tests/support/sample-repositories';
import { FULL_THEME } from '#theme/settings';

describe('runScreens', () => {
  it('should show the screens until the user quits', async () => {
    const session = wholeSession({
      health: () => Promise.resolve(BUSY_HEALTH),
    });
    const terminal = fakeTerminal();

    const shown = runScreens({
      terminal: terminal.ends,
      theme: { ...FULL_THEME, animation: false },
      reach: () =>
        Promise.resolve({
          outcome: 'ready',
          api: session.api,
          health: IDLE_HEALTH,
        }),
      sessionOf: () => session,
    });
    await expect.poll(terminal.drawn, PATIENT).toContain('service up');
    terminal.press('q');

    await expect(shown).resolves.toBe(
      '2 improvements and 1 scan keep running. ' +
        'See them with: coverage-autopilot list',
    );
  });
});
