/** The files a file leads to in one step. */
export type Next = (path: string) => readonly string[];

function chainTo(
  end: string,
  cameFrom: ReadonlyMap<string, string | undefined>,
): string[] {
  const before = cameFrom.get(end);
  return before === undefined ? [end] : [...chainTo(before, cameFrom), end];
}

/**
 * The shortest chain of steps from a file to the nearest one that is
 * looked for, both ends in it, or nothing when no chain leads to one. The
 * start may be what is looked for. Files are visited in the order the
 * steps give them, so the same graph gives the same chain.
 */
export function chainFrom(
  start: string,
  next: Next,
  isLookedFor: (path: string) => boolean,
): string[] | undefined {
  const cameFrom = new Map<string, string | undefined>([[start, undefined]]);
  const waiting = [start];
  for (const path of waiting) {
    if (isLookedFor(path)) {
      return chainTo(path, cameFrom);
    }
    for (const step of next(path)) {
      if (!cameFrom.has(step)) {
        cameFrom.set(step, path);
        waiting.push(step);
      }
    }
  }
  return undefined;
}
