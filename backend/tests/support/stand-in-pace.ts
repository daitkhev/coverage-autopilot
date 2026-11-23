import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The file in the folder of a stand-in that says how long each command
 * it plays takes, in milliseconds. A command takes no time without it.
 */
const PACE = 'pace';

/**
 * Makes every command the stand-in in `folder` plays take this long, as
 * a real tool takes its time, so a service can die while one runs.
 */
export function playAtPace(folder: string, ms: number): void {
  writeFileSync(join(folder, PACE), String(ms));
}

/** How long each command of the stand-in in `folder` takes. */
export function paceOf(folder: string): number {
  const path = join(folder, PACE);
  return existsSync(path) ? Number(readFileSync(path, 'utf8')) : 0;
}
