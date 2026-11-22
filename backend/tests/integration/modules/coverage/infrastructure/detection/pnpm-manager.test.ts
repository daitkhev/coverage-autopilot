import { afterEach, describe, expect, it } from 'vitest';

import { pnpmChoice } from '#coverage/infrastructure/detection/pnpm-manager';
import {
  PNPM_7_LOCKFILE,
  PNPM_8_LOCKFILE,
  pnpm12LockfileOf,
  pnpmLockfileOf,
} from '#tests/support/pnpm-lockfiles';
import {
  createProjectFolder,
  type ProjectFolder,
} from '#tests/support/project-folder';

const HASHED =
  'pnpm@10.34.9+sha512.f49b5a8ea0fdedb4a1d5e5c7f3c2b2e1d0c9b8a7f6e5d4c3b2a1';

const folders: ProjectFolder[] = [];

function choiceIn(
  files: Readonly<Record<string, string>>,
  descriptor: string | null = null,
): ReturnType<typeof pnpmChoice> {
  const folder = createProjectFolder(files);
  folders.push(folder);
  return pnpmChoice(folder.root, descriptor);
}

function lockedIn(lockfile: string, name: string): string | null {
  const choice = choiceIn({ 'pnpm-lock.yaml': lockfile });
  return choice.outcome === 'found'
    ? choice.value.lockedVersion(lockfile, { name, range: '' })
    : null;
}

afterEach(() => {
  for (const folder of folders.splice(0)) {
    folder.remove();
  }
});

describe('pnpmChoice', () => {
  describe('when package.json names no pnpm', () => {
    it.each([
      ['9.0', pnpmLockfileOf({ vitest: '4.1.12' }), 'pnpm@10.34.9'],
      ['6.0', PNPM_8_LOCKFILE, 'pnpm@8.15.9'],
      ['5.4', PNPM_7_LOCKFILE, 'pnpm@7.33.7'],
    ])(
      'should install a lockfile of the format %s with the pnpm that writes it',
      (_format, lockfile, program) => {
        const choice = choiceIn({ 'pnpm-lock.yaml': lockfile });

        expect(
          choice.outcome === 'found' &&
            choice.value.install.command.slice(0, 2),
        ).toEqual(['corepack', program]);
      },
    );

    it('should be unsupported for a format no pnpm it knows writes', () => {
      expect(
        choiceIn({ 'pnpm-lock.yaml': "lockfileVersion: '5.3'\n" }),
      ).toEqual({
        outcome: 'unsupported',
        reason: 'unsupported_package_manager',
        detail:
          'pnpm-lock.yaml has the format 5.3, which no pnpm the service ' +
          'knows writes, and package.json names no pnpm.',
      });
    });
  });

  describe('when package.json names a pnpm', () => {
    it('should install with that pnpm and its hash, frozen, without scripts or a pnpmfile', () => {
      const choice = choiceIn(
        { 'pnpm-lock.yaml': "lockfileVersion: '5.3'\n" },
        HASHED,
      );

      expect(choice).toEqual({
        outcome: 'found',
        value: {
          name: 'pnpm',
          lockfile: 'pnpm-lock.yaml',
          install: {
            command: [
              'corepack',
              HASHED,
              'install',
              '--frozen-lockfile',
              '--ignore-scripts',
              '--ignore-pnpmfile',
              '--store-dir',
              'node_modules/.cache/coverage-autopilot/install',
              '--config.manage-package-manager-versions=false',
              '--reporter=append-only',
            ],
            environment: { COREPACK_ENV_FILE: '0' },
          },
          lockedVersion: expect.any(Function) as unknown,
        },
      });
    });
  });

  describe('when the install would run code', () => {
    it.each([
      [
        'a hook of pnpm-workspace.yaml',
        {
          'pnpm-workspace.yaml':
            'configDependencies:\n  acme: 1.0.0+sha512-x\n',
        },
        'pnpm-workspace.yaml names configDependencies',
      ],
      [
        'a package from git',
        {
          'pnpm-lock.yaml':
            "lockfileVersion: '9.0'\n\npackages:\n\n  gadgets@git+https://example.com/acme/gadgets.git#abc:\n" +
            '    resolution: {commit: abc, repo: https://example.com/acme/gadgets.git, type: git}\n',
        },
        'pnpm-lock.yaml takes a package from a git repository',
      ],
      [
        'an archive of a host of git',
        {
          'pnpm-lock.yaml':
            "lockfileVersion: '9.0'\n\npackages:\n\n  gadgets@https://codeload.github.com/acme/gadgets/tar.gz/abc:\n" +
            '    resolution: {tarball: https://codeload.github.com/acme/gadgets/tar.gz/abc}\n',
        },
        'pnpm-lock.yaml takes a package from a git repository',
      ],
    ])('should refuse %s, naming it', (_what, files, detail) => {
      const choice = choiceIn(
        { 'pnpm-lock.yaml': pnpmLockfileOf({}), ...files },
        HASHED,
      );

      expect(choice).toMatchObject({
        outcome: 'unsupported',
        reason: 'install_runs_code',
      });
      expect(choice.outcome === 'unsupported' && choice.detail).toContain(
        detail,
      );
    });

    it('should take a workspace file of settings alone for no hook', () => {
      const choice = choiceIn(
        {
          'pnpm-lock.yaml': pnpmLockfileOf({}),
          'pnpm-workspace.yaml': 'onlyBuiltDependencies:\n  - esbuild\n',
        },
        HASHED,
      );

      expect(choice.outcome).toBe('found');
    });
  });

  describe('the version a lockfile locks', () => {
    it('should read a dev dependency of the project without its peers', () => {
      expect(
        lockedIn(
          pnpmLockfileOf({ vitest: '4.1.12', '@vitest/coverage-v8': '4.1.12' }),
          '@vitest/coverage-v8',
        ),
      ).toBe('4.1.12');
    });

    it.each([
      ['pnpm 8', PNPM_8_LOCKFILE],
      ['pnpm 7', PNPM_7_LOCKFILE],
    ])('should read the lockfile of %s', (_writer, lockfile) => {
      expect(lockedIn(lockfile, 'jest')).toBe('30.5.2');
    });

    it('should read the document of the project in the lockfile of pnpm 12', () => {
      expect(lockedIn(pnpm12LockfileOf({ vitest: '4.1.12' }), 'vitest')).toBe(
        '4.1.12',
      );
    });

    it('should not take the version of a package of another package', () => {
      expect(lockedIn(pnpmLockfileOf({ vitest: '4.1.12' }), 'jest')).toBeNull();
    });
  });
});
