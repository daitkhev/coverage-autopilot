import { describe, expect, it } from 'vitest';

import { cellWidth } from '#tests/support/terminal-text';
import { FULL_THEME } from '#theme/settings';
import {
  frameOf,
  FRAMES,
  keyTextOf,
  SPINNER_FRAMES,
  spinnerFrameOf,
  symbolOf,
  SYMBOLS,
} from '#theme/symbols';

const ASCII = { ...FULL_THEME, unicode: false };
const STILL = { ...FULL_THEME, animation: false };

describe('SYMBOLS', () => {
  it('should measure a wide character as two cells', () => {
    expect(cellWidth('中')).toBe(2);
    expect(cellWidth('->')).toBe(2);
  });

  describe.each(Object.entries(SYMBOLS))('%s', (_name, glyphs) => {
    it('should have an ASCII replacement of the same width', () => {
      expect(cellWidth(glyphs.unicode)).toBe(cellWidth(glyphs.ascii));
    });

    it('should take one cell', () => {
      expect(cellWidth(glyphs.unicode)).toBe(1);
    });

    it('should replace it with plain ASCII', () => {
      expect(glyphs.ascii).toMatch(/^[\x20-\x7e]+$/u);
    });
  });
});

describe('SPINNER_FRAMES', () => {
  it('should have ten frames', () => {
    expect(SPINNER_FRAMES.unicode).toHaveLength(10);
  });

  it.each([...SPINNER_FRAMES.unicode, ...SPINNER_FRAMES.ascii])(
    'should draw %s in one cell',
    (frame) => {
      expect(cellWidth(frame)).toBe(1);
    },
  );
});

describe('FRAMES', () => {
  it.each(['topLeft', 'topRight', 'line'] as const)(
    'should draw the %s of a frame in one cell either way',
    (part) => {
      expect(cellWidth(FRAMES.unicode[part])).toBe(1);
      expect(cellWidth(FRAMES.ascii[part])).toBe(1);
    },
  );
});

describe('symbolOf', () => {
  it('should give the Unicode symbol', () => {
    expect(symbolOf('passed', FULL_THEME)).toBe('✓');
  });

  describe('when the terminal cannot show Unicode', () => {
    it('should give the ASCII replacement', () => {
      expect(symbolOf('passed', ASCII)).toBe('+');
    });
  });
});

describe('spinnerFrameOf', () => {
  it('should turn through the ten frames', () => {
    expect(spinnerFrameOf(2, FULL_THEME)).toBe('⠹');
    expect(spinnerFrameOf(12, FULL_THEME)).toBe('⠹');
  });

  describe('when animation is turned off', () => {
    it('should stay on the first frame', () => {
      expect(spinnerFrameOf(2, STILL)).toBe('⠋');
    });
  });

  describe('when the terminal cannot show Unicode', () => {
    it('should be a still star', () => {
      expect(spinnerFrameOf(2, ASCII)).toBe('*');
    });
  });
});

describe('frameOf', () => {
  it('should give rounded corners', () => {
    expect(frameOf(FULL_THEME).box).toBe('round');
  });

  describe('when the terminal cannot show Unicode', () => {
    it('should give the classic frame', () => {
      expect(frameOf(ASCII).box).toBe('classic');
    });
  });
});

describe('keyTextOf', () => {
  it('should draw the arrow keys as symbols', () => {
    expect(keyTextOf('up-down', FULL_THEME)).toBe('↑↓');
    expect(keyTextOf('right', ASCII)).toBe('>');
  });

  it('should draw any other key as it is named', () => {
    expect(keyTextOf('enter', FULL_THEME)).toBe('enter');
    expect(keyTextOf('constructor', FULL_THEME)).toBe('constructor');
  });
});
