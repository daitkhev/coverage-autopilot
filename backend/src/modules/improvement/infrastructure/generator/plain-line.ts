/**
 * Control characters, which a terminal can read as a command, invisible
 * format characters, which can hide text, and breaks of a line.
 */
const UNPRINTABLE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;

const SPACES = /\s+/gu;

/**
 * A text of the repository or of the CLI as one short line of plain
 * characters, so it cannot start a line of its own where it is shown. It
 * is cut by characters, never inside one.
 */
export function plainLine(text: string, most: number): string {
  const line = text.replace(UNPRINTABLE, ' ').replace(SPACES, ' ').trim();
  return Array.from(line).slice(0, most).join('');
}
