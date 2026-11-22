import { kill } from 'node:process';

/** What a kill needs of a program that leads a group of its own. */
interface GroupLeader {
  readonly pid?: number | undefined;
  once(event: 'exit', listener: () => void): unknown;
}

function killNow(leader: GroupLeader): void {
  if (leader.pid === undefined) {
    return;
  }
  try {
    kill(-leader.pid, 'SIGKILL');
  } catch {
    // Nothing of the group is left to kill.
  }
}

/**
 * Kills a program with every program it started. It must lead a group of
 * its own. The group is killed now and again once the leader ended: a
 * helper the leader was starting while the group was killed is not yet
 * in the group, outlives the kill and keeps the streams of the leader.
 */
export function killGroup(leader: GroupLeader): void {
  killNow(leader);
  leader.once('exit', () => {
    killNow(leader);
  });
}
