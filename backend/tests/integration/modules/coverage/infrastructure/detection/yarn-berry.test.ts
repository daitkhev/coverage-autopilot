import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { InstallMode } from '#coverage/application/ports/project-detector.port';
import { berryChoice } from '#coverage/infrastructure/detection/yarn-berry';
import {
  createProjectFolder,
  type ProjectFolder,
} from '#tests/support/project-folder';
import { berryLockfileOf } from '#tests/support/yarn-lockfiles';

const LOCK = berryLockfileOf({ jest: '30.5.2' });

const HASHED = 'yarn@4.13.0+sha224.953c8233f7a92884eee2de69a1b92d1f2ec1655e';

const folders: ProjectFolder[] = [];

function folderWith(settings: string): ProjectFolder {
  const folder = createProjectFolder({ '.yarnrc.yml': settings });
  folders.push(folder);
  return folder;
}

function choiceIn(
  lockfile: string,
  descriptor: string | null = null,
  mode: InstallMode = 'sandboxed',
): ReturnType<typeof berryChoice> {
  const folder = folderWith('nodeLinker: node-modules\n');
  return berryChoice({ root: folder.root, mode }, lockfile, descriptor);
}

/** A package from git, one of git in a patch, and one a script makes. */
const RUNS_CODE = [
  'gadgets@https://example.com/acme/gadgets.git#commit=0a1b',
  'gadgets@patch:gadgets@https%3A//example.com/acme/gadgets.git%23commit%3D0a1b#./gadgets.patch',
  'gadgets@exec:./make-gadgets.js#./make-gadgets.js::hash=0a1b',
];

function lockedIn(name: string, range: string): string | null {
  const choice = choiceIn(LOCK);
  return choice.outcome === 'found'
    ? choice.value.lockedVersion(LOCK, { name, range })
    : null;
}

function withResolution(resolution: string): string {
  return `${LOCK}\n"gadgets@acme/gadgets":\n  version: 1.0.0\n  resolution: "${resolution}"\n`;
}

afterEach(() => {
  for (const folder of folders.splice(0)) {
    folder.remove();
  }
});

describe('berryChoice', () => {
  describe('when package.json names no yarn', () => {
    it.each([
      ['6', /^yarn@3\.8\.7\+sha512\.[0-9a-f]{128}$/u],
      ['8', /^yarn@4\.13\.0\+sha512\.[0-9a-f]{128}$/u],
      ['9', /^yarn@4\.14\.1\+sha512\.[0-9a-f]{128}$/u],
      ['10', /^yarn@4\.18\.1\+sha512\.[0-9a-f]{128}$/u],
    ])(
      'should install a lockfile of the format %s with the yarn that writes it, and its hash',
      (format, program) => {
        const choice = choiceIn(berryLockfileOf({}, format));

        expect(
          choice.outcome === 'found' && choice.value.install.command[1],
        ).toMatch(program);
      },
    );

    it('should be unsupported for a format no yarn it knows writes', () => {
      expect(choiceIn(berryLockfileOf({}, '4'))).toEqual({
        outcome: 'unsupported',
        reason: 'unsupported_package_manager',
        detail:
          'yarn.lock has the format 4, which no yarn the service knows ' +
          'writes, and package.json names no yarn.',
      });
    });
  });

  describe('when package.json names a yarn', () => {
    it('should install with it, immutable, with no build and the settings of the service', () => {
      expect(choiceIn(LOCK, HASHED)).toEqual({
        outcome: 'found',
        value: {
          name: 'yarn',
          lockfile: 'yarn.lock',
          install: {
            command: [
              'corepack',
              HASHED,
              'install',
              '--immutable',
              '--mode=skip-build',
            ],
            environment: {
              COREPACK_ENV_FILE: '0',
              COREPACK_NPM_REGISTRY: 'https://registry.npmjs.org',
              YARN_IGNORE_PATH: '1',
              YARN_RC_FILENAME: '.coverage-autopilot-yarnrc.yml',
              YARN_ENABLE_SCRIPTS: '0',
              YARN_ENABLE_GLOBAL_CACHE: '0',
              YARN_ENABLE_MIRROR: '0',
              YARN_CACHE_FOLDER: '.yarn/cache',
              YARN_ENABLE_TELEMETRY: '0',
              YARN_CHECKSUM_BEHAVIOR: 'throw',
              YARN_NODE_LINKER: 'node-modules',
            },
          },
          lockedVersion: expect.any(Function) as unknown,
        },
      });
    });
  });

  describe('when the install would run code', () => {
    it.each(RUNS_CODE)('should refuse %s', (resolution) => {
      expect(choiceIn(withResolution(resolution))).toEqual({
        outcome: 'unsupported',
        reason: 'install_runs_code',
        detail:
          'yarn.lock takes a package from a git repository, which yarn ' +
          'packs by running its scripts, or one that a script makes.',
      });
    });

    it('should take a patch of a package of the registry', () => {
      const resolution =
        'typescript@patch:typescript@npm%3A5.6.3#optional!builtin<compat/typescript>::version=5.6.3';

      expect(choiceIn(withResolution(resolution)).outcome).toBe('found');
    });
  });

  describe('when the repository is trusted', () => {
    it('should install with its own yarn, settings and scripts, still immutable', () => {
      const choice = choiceIn(LOCK, HASHED, 'trusted');

      expect(choice.outcome === 'found' && choice.value.install).toEqual({
        command: ['corepack', HASHED, 'install', '--immutable'],
        environment: {
          COREPACK_ENV_FILE: '0',
          COREPACK_NPM_REGISTRY: 'https://registry.npmjs.org',
          YARN_ENABLE_GLOBAL_CACHE: '0',
          YARN_ENABLE_MIRROR: '0',
          YARN_CACHE_FOLDER: '.yarn/cache',
          YARN_ENABLE_TELEMETRY: '0',
          YARN_CHECKSUM_BEHAVIOR: 'throw',
          YARN_NODE_LINKER: 'node-modules',
        },
      });
    });

    it.each(RUNS_CODE)('should take %s', (resolution) => {
      expect(
        choiceIn(withResolution(resolution), HASHED, 'trusted').outcome,
      ).toBe('found');
    });

    it('should read the settings of the repository as they are, and write none', () => {
      const folder = folderWith(
        'nodeLinker: node-modules\nyarnPath: ./yarn.cjs\n{plugins: []}\n',
      );

      const choice = berryChoice(
        { root: folder.root, mode: 'trusted' },
        LOCK,
        HASHED,
      );

      expect(choice.outcome).toBe('found');
      expect(
        existsSync(join(folder.root, '.coverage-autopilot-yarnrc.yml')),
      ).toBe(false);
    });

    it('should still refuse Plug and Play', () => {
      const folder = folderWith('nodeLinker: pnp\n');

      expect(
        berryChoice({ root: folder.root, mode: 'trusted' }, LOCK, HASHED),
      ).toMatchObject({ outcome: 'unsupported', reason: 'plug_and_play' });
    });
  });

  describe('the version a lockfile locks', () => {
    it('should read the entry of the range of the manifest', () => {
      expect(lockedIn('jest', '~30.5.2')).toBe('30.5.2');
    });

    it('should read a range that names its protocol', () => {
      expect(lockedIn('jest', 'npm:^30.5.2')).toBe('30.5.2');
    });

    it('should not take the version of a package of another package', () => {
      expect(lockedIn('@acme/core', '30.5.2')).toBeNull();
    });
  });
});
