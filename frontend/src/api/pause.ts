import { setTimeout } from 'node:timers/promises';

/**
 * Waits for `ms` milliseconds. It is the one way the client waits, and it
 * is handed to what waits, so a test decides how long a wait is.
 */
export async function pause(ms: number): Promise<void> {
  await setTimeout(ms);
}
