import { afterEach, describe, expect, it } from 'vitest';

import { yarnChoice } from '#coverage/infrastructure/detection/yarn-manager';
import {
  createProjectFolder,
  type ProjectFolder,
} from '#tests/support/project-folder';
import { classicLockfileOf } from '#tests/support/yarn-lockfiles';

const CLASSIC_LOCK = classicLockfileOf({ jest: '30.5.2' });

const HASHED = 'yarn@1.22.22+sha512.a6b2f7906b721bba3d67d4aff083df04dad64c39';

const folders: ProjectFolder[] = [];

function choiceIn(
  lockfile: string,
  descriptor: string | null = null,
): ReturnType<typeof yarnChoice> {
  const folder = createProjectFolder({ 'yarn.lock': lockfile });
  folders.push(folder);
  return yarnChoice(folder.root, descriptor);
}

function lockedIn(lockfile: string, name: string, range: string): unknown {
  const choice = choiceIn(lockfile);
  return choice.outcome === 'found'
    ? choice.value.lockedVersion(lockfile, { name, range })
    : choice.reason;
}

function withEntry(resolved: string): string {
  return `${CLASSIC_LOCK}\ngadgets@acme/gadgets:\n  version "1.0.0"\n  resolved "${resolved}"\n`;
}

afterEach(() => {
  for (const folder of folders.splice(0)) {
    folder.remove();
  }
});

describe('yarnChoice', () => {
  describe('when the lockfile is of yarn 1', () => {
    it('should install with the last yarn 1, frozen, without scripts or a program of the repository', () => {
      expect(choiceIn(CLASSIC_LOCK)).toEqual({
        outcome: 'found',
        value: {
          name: 'yarn',
          lockfile: 'yarn.lock',
          install: {
            command: [
              'corepack',
              'yarn@1.22.22',
              'install',
              '--frozen-lockfile',
              '--ignore-scripts',
              '--ignore-engines',
              '--non-interactive',
              '--cache-folder',
              'node_modules/.cache/coverage-autopilot/install',
            ],
            environment: { COREPACK_ENV_FILE: '0', YARN_IGNORE_PATH: '1' },
          },
          lockedVersion: expect.any(Function) as unknown,
        },
      });
    });

    it('should install with the yarn package.json names, with its hash', () => {
      const choice = choiceIn(CLASSIC_LOCK, HASHED);

      expect(
        choice.outcome === 'found' && choice.value.install.command[1],
      ).toBe(HASHED);
    });

    it('should refuse a yarn of another format, naming both', () => {
      expect(choiceIn(CLASSIC_LOCK, 'yarn@4.18.1')).toEqual({
        outcome: 'unsupported',
        reason: 'unsupported_package_manager',
        detail:
          'package.json names yarn@4.18.1, and yarn.lock has the format of ' +
          'yarn 1.',
      });
    });

    it.each([
      'git+https://example.com/acme/gadgets.git#0a1b',
      'git://example.com/acme/gadgets.git#0a1b',
      'git+ssh://git@example.com/acme/gadgets.git#0a1b',
      'ssh://git@example.com/acme/gadgets#0a1b',
      'https://example.com/acme/gadgets.git#0a1b',
    ])('should refuse a package from git, %s', (resolved) => {
      expect(choiceIn(withEntry(resolved))).toEqual({
        outcome: 'unsupported',
        reason: 'install_runs_code',
        detail:
          'yarn.lock takes a package from a git repository, which yarn ' +
          'prepares by running its scripts.',
      });
    });

    it('should take an archive of a host of git, which it unpacks as it is', () => {
      const resolved = 'https://codeload.example.com/acme/gadgets/tar.gz/0a1b';

      expect(choiceIn(withEntry(resolved)).outcome).toBe('found');
    });
  });

  describe('when the lockfile is of yarn 2 or later', () => {
    const berryLock = '__metadata:\n  version: 8\n  cacheKey: 10c0\n';

    it('should refuse yarn 1 named for it', () => {
      expect(choiceIn(berryLock, HASHED)).toMatchObject({
        outcome: 'unsupported',
        reason: 'unsupported_package_manager',
        detail: `package.json names ${HASHED}, and yarn.lock has the format of yarn 2 or later.`,
      });
    });

    it('should say that only yarn 1 is supported', () => {
      expect(choiceIn(berryLock)).toMatchObject({
        outcome: 'unsupported',
        reason: 'unsupported_package_manager',
      });
    });
  });

  describe('the version a lockfile locks', () => {
    it('should read the entry of the range of the manifest', () => {
      expect(lockedIn(CLASSIC_LOCK, 'jest', '^30.5.2')).toBe('30.5.2');
    });

    it('should read a scoped package, which yarn quotes', () => {
      const lockfile = classicLockfileOf({ '@vitest/coverage-v8': '4.1.12' });

      expect(lockedIn(lockfile, '@vitest/coverage-v8', '~4.1.12')).toBe(
        '4.1.12',
      );
    });

    it('should read nothing for a range no entry resolves', () => {
      expect(lockedIn(CLASSIC_LOCK, 'jest', '30.5.2')).toBeNull();
    });
  });
});
