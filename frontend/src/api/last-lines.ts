/** Enough to show why a start failed, and few enough for one screen. */
const SHOWN_LINES = 20;

/** The last lines of a text a process wrote, without the empty ones. */
export function lastLinesOf(text: string): string[] {
  return text
    .split(/\r?\n/u)
    .filter((line) => line.trim() !== '')
    .slice(-SHOWN_LINES);
}
