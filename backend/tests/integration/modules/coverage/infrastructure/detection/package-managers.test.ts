import { afterEach, describe, expect, it } from 'vitest';

import { chooseManager } from '#coverage/infrastructure/detection/package-managers';
import type { PackageManifest } from '#coverage/infrastructure/detection/package-manifest.schema';
import { pnpmLockfileOf } from '#tests/support/pnpm-lockfiles';
import {
  createProjectFolder,
  lockfileOf,
  type ProjectFolder,
} from '#tests/support/project-folder';
import { classicLockfileOf } from '#tests/support/yarn-lockfiles';

const NPM_LOCK = lockfileOf({ jest: '30.5.2' });

const PNPM_LOCK = pnpmLockfileOf({ jest: '30.5.2' });

const YARN_LOCK = classicLockfileOf({ jest: '30.5.2' });

const folders: ProjectFolder[] = [];

function chosenIn(
  files: Readonly<Record<string, string>>,
  manifest: PackageManifest = {},
): ReturnType<typeof chooseManager> {
  const folder = createProjectFolder(files);
  folders.push(folder);
  return chooseManager({ root: folder.root, mode: 'sandboxed' }, manifest);
}

function nameOrReason(choice: ReturnType<typeof chooseManager>): string {
  return choice.outcome === 'found' ? choice.value.name : choice.reason;
}

/** The program and the first word of the install, or the reason of none. */
function programOf(choice: ReturnType<typeof chooseManager>): string[] {
  return choice.outcome === 'found'
    ? choice.value.install.command.slice(0, 2)
    : [choice.reason];
}

afterEach(() => {
  for (const folder of folders.splice(0)) {
    folder.remove();
  }
});

describe('chooseManager', () => {
  describe('when package.json names no manager', () => {
    it.each([
      ['npm', { 'package-lock.json': NPM_LOCK }],
      ['npm', { 'npm-shrinkwrap.json': NPM_LOCK }],
      ['pnpm', { 'pnpm-lock.yaml': PNPM_LOCK }],
      ['yarn', { 'yarn.lock': YARN_LOCK }],
    ])('should take %s from the one lockfile there is', (name, files) => {
      expect(nameOrReason(chosenIn(files))).toBe(name);
    });

    it('should have no lockfile when there is none', () => {
      expect(chosenIn({})).toEqual({
        outcome: 'unsupported',
        reason: 'no_lockfile',
        detail: 'The repository has no lockfile.',
      });
    });

    it('should not guess between the lockfiles of two managers', () => {
      expect(
        chosenIn({
          'package-lock.json': NPM_LOCK,
          'pnpm-lock.yaml': PNPM_LOCK,
        }),
      ).toEqual({
        outcome: 'unsupported',
        reason: 'unsupported_package_manager',
        detail:
          'The repository has the lockfiles of npm and pnpm, and ' +
          'package.json names no packageManager to choose one.',
      });
    });
  });

  describe('when package.json names a manager', () => {
    it('should take it over the lockfile of another', () => {
      const choice = chosenIn(
        { 'package-lock.json': NPM_LOCK, 'pnpm-lock.yaml': PNPM_LOCK },
        { packageManager: 'pnpm@10.34.9' },
      );

      expect(programOf(choice)).toEqual(['corepack', 'pnpm@10.34.9']);
    });

    it.each(['npm', 'npm@10.9.2', 'npm@^10'])(
      'should take "%s" for the npm of the image',
      (packageManager) => {
        const choice = chosenIn(
          { 'package-lock.json': NPM_LOCK },
          { packageManager },
        );

        expect(programOf(choice)).toEqual(['npm', 'ci']);
      },
    );

    it.each([
      'pnpm@^10.0.0',
      'pnpm@latest',
      'pnpm@https://registry.example.com/pnpm-10.34.9.tgz',
      'pnpm',
    ])('should refuse "%s", which is no exact program', (packageManager) => {
      expect(
        nameOrReason(
          chosenIn({ 'pnpm-lock.yaml': PNPM_LOCK }, { packageManager }),
        ),
      ).toBe('unsupported_package_manager');
    });

    it('should say that its lockfile is missing', () => {
      expect(
        chosenIn(
          { 'package-lock.json': NPM_LOCK },
          { packageManager: 'pnpm@10.34.9' },
        ),
      ).toEqual({
        outcome: 'unsupported',
        reason: 'no_lockfile',
        detail:
          'package.json names pnpm, and the repository has no lockfile of pnpm.',
      });
    });
  });

  describe('when the repository is trusted', () => {
    it('should let npm run the scripts, from the lockfile alone', () => {
      const folder = createProjectFolder({ 'package-lock.json': NPM_LOCK });
      folders.push(folder);

      const choice = chooseManager({ root: folder.root, mode: 'trusted' }, {});

      expect(choice.outcome === 'found' && choice.value.install).toEqual({
        command: [
          'npm',
          'ci',
          '--no-audit',
          '--no-fund',
          '--cache',
          'node_modules/.cache/coverage-autopilot/install',
        ],
        environment: {},
      });
    });
  });

  describe('when the manager is not supported', () => {
    it.each([
      [{ 'bun.lock': '{}' }, {}],
      [{ 'bun.lockb': '' }, {}],
      [{ 'bun.lock': '{}' }, { packageManager: 'bun@1.3.2' }],
    ])('should name it', (files, manifest) => {
      expect(chosenIn(files, manifest)).toEqual({
        outcome: 'unsupported',
        reason: 'unsupported_package_manager',
        detail:
          'The repository is installed with bun, and only npm, pnpm, and ' +
          'yarn are supported.',
      });
    });
  });
});
