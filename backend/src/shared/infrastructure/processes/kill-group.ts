import { kill } from 'node:process';

/**
 * Kills a program that was started as the leader of a group of its own,
 * with every helper it started. A helper that outlived the program would
 * keep its streams open, and whoever waits for their end would wait for
 * the helper.
 */
export function killGroup(leader: { readonly pid?: number | undefined }): void {
  if (leader.pid === undefined) {
    return;
  }
  try {
    kill(-leader.pid, 'SIGKILL');
  } catch {
    // The group ended on its own between its last event and the kill.
  }
}
