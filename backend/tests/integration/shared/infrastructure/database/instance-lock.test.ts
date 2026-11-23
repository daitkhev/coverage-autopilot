import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { InstanceLockReleasedError } from '#infrastructure/database/errors/instance-lock-released.error';
import { UnusableLockFileError } from '#infrastructure/database/errors/unusable-lock-file.error';
import {
  InstanceLock,
  type InstanceLockTaking,
} from '#infrastructure/database/instance-lock';
import { crash, startLockHolder } from '#tests/support/lock-holder';

/**
 * Far longer than a refusal takes, and far shorter than the five seconds
 * a connection of the database waits for a busy file.
 */
const AT_ONCE_MS = 1_000;

let folder: string;
let path: string;
let held: InstanceLock[];

/** Takes the lock of the test, and releases what it took after the test. */
function attempt(): InstanceLockTaking {
  const taking = InstanceLock.take(path);
  if (taking.outcome === 'taken') {
    held.push(taking.lock);
  }
  return taking;
}

function taken(): InstanceLock {
  const taking = attempt();
  if (taking.outcome !== 'taken') {
    throw new Error('Another holds the lock of the test.');
  }
  return taking.lock;
}

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'instance-lock-'));
  path = join(folder, 'instance.lock');
  held = [];
});

afterEach(() => {
  for (const lock of held) {
    lock.release();
  }
  rmSync(folder, { recursive: true, force: true });
});

describe('InstanceLock', () => {
  describe('take', () => {
    it('should take the lock of a file it makes', () => {
      expect(attempt().outcome).toBe('taken');
      expect(existsSync(path)).toBe(true);
    });

    describe('when another connection holds it', () => {
      it('should answer held_by_another at once, without waiting', () => {
        taken();
        const started = performance.now();

        const second = attempt();

        expect(performance.now() - started).toBeLessThan(AT_ONCE_MS);
        expect(second).toEqual({ outcome: 'held_by_another' });
      });

      it('should take it once the first is released, from the same file', () => {
        const first = taken();
        attempt();
        first.release();

        expect(attempt().outcome).toBe('taken');
        expect(existsSync(path)).toBe(true);
      });
    });

    describe('when the process that holds it is killed', () => {
      it('should take it after SIGKILL', async () => {
        const holder = await startLockHolder(path);
        const whileItLives = attempt();

        await crash(holder);

        expect(whileItLives).toEqual({ outcome: 'held_by_another' });
        expect(attempt().outcome).toBe('taken');
      });
    });

    describe('when the file holds something else than SQLite', () => {
      it('should throw UnusableLockFileError that names the file', () => {
        writeFileSync(path, 'notes of a person\n'.repeat(64));

        expect(() => InstanceLock.take(path)).toThrow(
          new UnusableLockFileError(
            `The file of the instance lock ${path} cannot be used: ` +
              'Error: file is not a database',
          ),
        );
      });
    });

    describe('when the folder of the file is missing', () => {
      it('should throw UnusableLockFileError', () => {
        expect(() =>
          InstanceLock.take(join(folder, 'missing', 'instance.lock')),
        ).toThrow(UnusableLockFileError);
      });
    });
  });

  describe('confirmHeld', () => {
    it('should pass while the lock is held', () => {
      expect(() => {
        taken().confirmHeld();
      }).not.toThrow();
    });

    describe('when the lock was released', () => {
      it('should throw InstanceLockReleasedError', () => {
        const lock = taken();
        lock.release();

        expect(() => {
          lock.confirmHeld();
        }).toThrow(InstanceLockReleasedError);
      });
    });
  });

  describe('release', () => {
    it('should do nothing when the lock was released before', () => {
      const lock = taken();
      lock.release();

      expect(() => {
        lock.release();
      }).not.toThrow();
      expect(attempt().outcome).toBe('taken');
    });
  });
});
