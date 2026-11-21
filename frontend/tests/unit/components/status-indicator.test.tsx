import { afterAll, describe, expect, it, vi } from 'vitest';

import { StatusIndicator } from '#components/status-indicator';
import {
  drawnAt,
  drawnWith,
  plainText,
  styledAt,
  USUAL_COLUMNS,
  WIDTHS,
} from '#tests/support/terminal-text';
import {
  ATTEMPT_VERDICT,
  CHECK_STATUS,
  FILE_STATE,
  IMPROVEMENT_STATUS,
  SERVICE_STATE,
  type StatusLook,
} from '#theme/status';
import { SPINNER_FRAMES, SYMBOLS } from '#theme/symbols';

/** Colour is forced on, so turning it off in the theme is what removes it. */
vi.hoisted(() => {
  vi.stubEnv('FORCE_COLOR', '1');
});
afterAll(() => {
  vi.unstubAllEnvs();
});

const ESCAPE = '\u001B';
const COLOUR_CODE = new RegExp(`${ESCAPE}\\[(3[0-9]|9[0-7])m`, 'u');
const BOLD_CODE = `${ESCAPE}[1m`;

const LOOKS: readonly (readonly [string, StatusLook])[] = [
  IMPROVEMENT_STATUS,
  ATTEMPT_VERDICT,
  CHECK_STATUS,
  FILE_STATE,
  SERVICE_STATE,
].flatMap((table) => Object.entries(table));

function glyphOf(look: StatusLook): string {
  return look.glyph === 'spinner'
    ? (SPINNER_FRAMES.unicode[0] ?? '')
    : SYMBOLS[look.glyph].unicode;
}

describe('StatusIndicator', () => {
  it('should draw a symbol and a word', () => {
    expect(
      drawnAt(
        <StatusIndicator look={IMPROVEMENT_STATUS.awaiting_approval} />,
        USUAL_COLUMNS,
      ),
    ).toMatchSnapshot();
  });

  it('should draw the word in colour when the terminal has colour', () => {
    const styled = styledAt(
      <StatusIndicator look={IMPROVEMENT_STATUS.failed} />,
      USUAL_COLUMNS,
    );

    expect(styled).toMatch(COLOUR_CODE);
  });

  describe('when colour is turned off', () => {
    it.each(LOOKS)(
      'should still show %s as a symbol and a word',
      (_status, look) => {
        const styled = styledAt(
          drawnWith({ colour: false }, <StatusIndicator look={look} />),
          USUAL_COLUMNS,
        );

        expect(styled).not.toMatch(COLOUR_CODE);
        expect(styled).toContain(BOLD_CODE);
        expect(plainText(styled)).toBe(`${glyphOf(look)} ${look.word}`);
      },
    );
  });

  describe('when the terminal cannot show Unicode', () => {
    it('should draw the ASCII replacement', () => {
      expect(
        drawnAt(
          drawnWith(
            { unicode: false },
            <StatusIndicator look={IMPROVEMENT_STATUS.completed} />,
          ),
          USUAL_COLUMNS,
        ),
      ).toBe('+ DONE');
    });
  });

  it.each(WIDTHS)('should fit in %i columns', (columns) => {
    const drawn = drawnAt(
      <StatusIndicator look={IMPROVEMENT_STATUS.cancelled} />,
      columns,
    );

    expect(drawn.length).toBeLessThanOrEqual(columns);
  });
});
