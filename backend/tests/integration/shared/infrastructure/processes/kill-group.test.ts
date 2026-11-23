import { type ChildProcess, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { execPath } from 'node:process';

import { describe, expect, it } from 'vitest';

import { killGroup } from '#infrastructure/processes/kill-group';

const WAITS = 'setInterval(() => undefined, 2147483647)';

/** A program that leads a group of its own and waits to be killed. */
function startGroup(): ChildProcess {
  return spawn(execPath, ['--eval', WAITS], {
    stdio: 'ignore',
    detached: true,
  });
}

function signalThatEnded(child: ChildProcess): Promise<string | null> {
  return new Promise((resolve) => {
    child.once('exit', (_code, signal) => {
      resolve(signal);
    });
  });
}

describe('killGroup', () => {
  it('should kill the group of a leader that runs', async () => {
    const leader = startGroup();
    const ended = signalThatEnded(leader);

    killGroup(leader);

    expect(await ended).toBe('SIGKILL');
  });

  describe('when a helper was born while the group was killed', () => {
    it('should kill the group again once the leader ended', async () => {
      const late = startGroup();
      const ended = signalThatEnded(late);
      const leader = Object.assign(new EventEmitter(), {
        pid: undefined as number | undefined,
      });
      killGroup(leader);

      leader.pid = late.pid;
      leader.emit('exit');

      expect(await ended).toBe('SIGKILL');
    });
  });

  describe('when the leader never started', () => {
    it('should kill nothing', () => {
      const leader = Object.assign(new EventEmitter(), { pid: undefined });

      expect(() => {
        killGroup(leader);
      }).not.toThrow();
    });
  });
});
