import { describe, expect, it } from 'vitest';

import { borderColourOf, textStyleOf } from '#theme/roles';
import { FULL_THEME } from '#theme/settings';

const NO_COLOUR = { ...FULL_THEME, colour: false };

describe('textStyleOf', () => {
  it('should give a role its colour', () => {
    expect(textStyleOf('accent', FULL_THEME)).toEqual({
      color: 'magenta',
      bold: false,
      dimColor: false,
      underline: false,
    });
  });

  it('should draw secondary text dim and a link underlined', () => {
    expect(textStyleOf('secondary', FULL_THEME).dimColor).toBe(true);
    expect(textStyleOf('link', FULL_THEME).underline).toBe(true);
    expect(textStyleOf('emphasis', FULL_THEME).bold).toBe(true);
  });

  describe('when colour is turned off', () => {
    it.each(['accent', 'success', 'warning', 'danger', 'running'] as const)(
      'should draw %s without a colour',
      (role) => {
        expect(textStyleOf(role, NO_COLOUR).color).toBeUndefined();
      },
    );

    it('should keep the weight of a role', () => {
      expect(textStyleOf('secondary', NO_COLOUR).dimColor).toBe(true);
      expect(textStyleOf('emphasis', NO_COLOUR).bold).toBe(true);
    });
  });
});

describe('borderColourOf', () => {
  it('should draw a border in grey', () => {
    expect(borderColourOf('border', FULL_THEME)).toEqual({
      borderColor: 'gray',
      borderDimColor: false,
    });
  });

  describe('when colour is turned off', () => {
    it('should draw the border in the default colour', () => {
      expect(borderColourOf('border', NO_COLOUR)).toEqual({
        borderDimColor: false,
      });
    });
  });
});
