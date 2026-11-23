import { describe, expect, it } from 'vitest';

import { plainLine } from '#improvement/infrastructure/generator/plain-line';

/** An escape, a space of no width and a separator of lines. */
const HIDDEN_CHARACTERS = String.fromCodePoint(0x1b, 0x200b, 0x2028);

const FACE = String.fromCodePoint(0x1f600);

describe('plainLine', () => {
  it('should put a text on one line of plain characters', () => {
    const text = `one\ntwo\r\n${HIDDEN_CHARACTERS}[31mred${HIDDEN_CHARACTERS}end  `;

    expect(plainLine(text, 100)).toBe('one two [31mred end');
  });

  it('should cut by characters and never inside one', () => {
    expect(plainLine(`a${FACE}b`, 2)).toBe(`a${FACE}`);
  });
});
