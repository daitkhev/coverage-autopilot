import { describe, expect, it } from 'vitest';

import { runScreens } from '#app/interactive';
import { fakeTerminal } from '#tests/support/fake-terminal';
import { KEYS, PATIENT } from '#tests/support/keys';
import { wholeSession } from '#tests/support/sample-app-session';
import { BUSY_HEALTH, IDLE_HEALTH } from '#tests/support/sample-repositories';
import { FULL_THEME } from '#theme/settings';

/** What a terminal is told to show its other screen, and to go back. */
const ENTER_OTHER_SCREEN = '\u001B[?1049h';
const LEAVE_OTHER_SCREEN = '\u001B[?1049l';

/** The screens over a busy service, in the terminal of a test. */
async function showing(
  terminal: ReturnType<typeof fakeTerminal>,
): Promise<string | undefined> {
  const session = wholeSession({
    health: () => Promise.resolve(BUSY_HEALTH),
  });
  return runScreens({
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
}

describe('runScreens', () => {
  it('should show the screens until the user quits', async () => {
    const terminal = fakeTerminal();

    const shown = showing(terminal);
    await expect.poll(terminal.drawn, PATIENT).toContain('service up');
    terminal.press('q');

    await expect(shown).resolves.toBe(
      '2 improvements and 1 scan keep running. ' +
        'See them with: coverage-autopilot list',
    );
  });

  it('should take the whole screen and give it back as it was', async () => {
    const terminal = fakeTerminal();

    const shown = showing(terminal);
    await expect.poll(terminal.drawn, PATIENT).toContain('service up');
    terminal.press('q');
    await shown;

    expect(terminal.drawn().indexOf(ENTER_OTHER_SCREEN)).toBeLessThan(
      terminal.drawn().indexOf('service up'),
    );
    expect(terminal.drawn().lastIndexOf(LEAVE_OTHER_SCREEN)).toBeGreaterThan(
      terminal.drawn().lastIndexOf('service up'),
    );
  });

  it('should leave on ctrl+c as on q, and say what keeps running', async () => {
    const terminal = fakeTerminal();

    const shown = showing(terminal);
    await expect.poll(terminal.drawn, PATIENT).toContain('service up');
    terminal.press(KEYS.ctrlC);

    await expect(shown).resolves.toContain('keep running');
  });
});
