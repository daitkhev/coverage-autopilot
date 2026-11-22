import { Text } from 'ink';
import { cleanup, render } from 'ink-testing-library';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { useSpinner } from '#hooks/use-spinner';
import { ThemeContext } from '#hooks/use-theme';
import { PATIENT, pause, screenOf } from '#tests/support/keys';
import { FULL_THEME } from '#theme/settings';
import { SPINNER_FRAMES } from '#theme/symbols';

function Spinners(): ReactNode {
  return <Text>{`${useSpinner()} ${useSpinner()}`}</Text>;
}

afterEach(cleanup);

describe('useSpinner', () => {
  it('should turn every spinner together on one timer', async () => {
    const terminal = render(<Spinners />);

    await expect
      .poll(() => screenOf(terminal).split(' ')[0], PATIENT)
      .not.toBe(SPINNER_FRAMES.unicode[0]);

    const [left, right] = screenOf(terminal).split(' ');
    expect(left).toBe(right);
  });

  describe('when animation is turned off', () => {
    it('should stay on the first frame', async () => {
      const terminal = render(
        <ThemeContext value={{ ...FULL_THEME, animation: false }}>
          <Spinners />
        </ThemeContext>,
      );

      await pause(200);

      expect(screenOf(terminal)).toBe('⠋ ⠋');
    });
  });

  describe('when the terminal cannot show Unicode', () => {
    it('should be a still star', () => {
      const terminal = render(
        <ThemeContext value={{ ...FULL_THEME, unicode: false }}>
          <Spinners />
        </ThemeContext>,
      );

      expect(screenOf(terminal)).toBe('* *');
    });
  });
});
