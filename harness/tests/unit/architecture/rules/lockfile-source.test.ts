import { describe, expect, it } from 'vitest';

import { lockfileSource } from '#harness/architecture/rules/lockfile-source';
import { structureOf } from '#harness/tests/support/policy-builder';
import { projectWithLockfile } from '#harness/tests/support/project-builder';

const SUM = `sha512-${'Ab0+/'.repeat(17)}w==`;
const PAD = {
  version: '1.2.3',
  resolved: 'https://registry.npmjs.org/left-pad/-/left-pad-1.2.3.tgz',
  integrity: SUM,
};
const NOT_REGISTRY =
  'does not come from the npm registry under its own name and version.';

function lockOf(packages: unknown, lockfileVersion: unknown = 3): unknown {
  return { name: 'fixture', lockfileVersion, packages };
}

function detailsOf(lockfile: unknown): string[] {
  return lockfileSource(structureOf())
    .check(projectWithLockfile(lockfile))
    .map((finding) => finding.detail);
}

/** The details for a lockfile whose one package is `entry` under `key`. */
function detailsFor(key: string, entry: unknown): string[] {
  return detailsOf(lockOf({ [key]: entry }));
}

describe('lockfileSource', () => {
  it('should judge nothing in a tree with no lockfile', () => {
    expect(detailsOf(undefined)).toEqual([]);
  });

  it('should pass the root, the workspaces and their links', () => {
    const packages = {
      '': { name: 'fixture', workspaces: ['backend', 'frontend'] },
      backend: { name: '@scope/backend', version: '0.0.0' },
      frontend: { name: '@scope/frontend', version: '0.0.0' },
      'node_modules/@scope/backend': { resolved: 'backend', link: true },
      'node_modules/@scope/frontend': { resolved: 'frontend', link: true },
    };

    expect(detailsOf(lockOf(packages))).toEqual([]);
  });

  it('should pass a package of the registry with a checksum', () => {
    expect(detailsFor('node_modules/left-pad', PAD)).toEqual([]);
  });

  it('should pass a package with a scope, and one below another', () => {
    const tool = {
      version: '2.0.0-beta.1',
      resolved:
        'https://registry.npmjs.org/@scope/tool/-/tool-2.0.0-beta.1.tgz',
      integrity: SUM,
    };
    const packages = {
      'node_modules/@scope/tool': tool,
      'node_modules/@scope/tool/node_modules/left-pad': PAD,
      'backend/node_modules/left-pad': PAD,
    };

    expect(detailsOf(lockOf(packages))).toEqual([]);
  });

  it('should report the finding at the first line of the lockfile', () => {
    const entry = { ...PAD, resolved: 'https://example.com/left-pad.tgz' };

    expect(
      lockfileSource(structureOf()).check(
        projectWithLockfile(lockOf({ 'node_modules/left-pad': entry })),
      ),
    ).toEqual([
      {
        rule: 'lockfile-source',
        path: 'package-lock.json',
        line: 1,
        detail: `"node_modules/left-pad" ${NOT_REGISTRY}`,
      },
    ]);
  });

  it.each([
    ['a git address', 'git+ssh://git@github.com/someone/left-pad.git#0123abc'],
    ['an archive from elsewhere', 'https://example.com/left-pad-1.2.3.tgz'],
    [
      'another registry',
      'https://registry.example.com/left-pad/-/left-pad-1.2.3.tgz',
    ],
    [
      'another package',
      'https://registry.npmjs.org/right-pad/-/right-pad-1.2.3.tgz',
    ],
    [
      'another version',
      'https://registry.npmjs.org/left-pad/-/left-pad-1.2.4.tgz',
    ],
    [
      'an address with more after it',
      'https://registry.npmjs.org/left-pad/-/left-pad-1.2.3.tgz?from=x',
    ],
    ['no address', undefined],
  ])('should report %s', (_name, resolved) => {
    expect(detailsFor('node_modules/left-pad', { ...PAD, resolved })).toEqual([
      `"node_modules/left-pad" ${NOT_REGISTRY}`,
    ]);
  });

  it('should report a path in the place of a version', () => {
    const entry = { version: 'file:../left-pad' };

    expect(detailsFor('node_modules/left-pad', entry)).toEqual([
      `"node_modules/left-pad" ${NOT_REGISTRY}`,
    ]);
  });

  it.each([
    ['no checksum', undefined],
    ['a weaker checksum', 'sha1-2jmj7l5rSw0yVb/vlWAYkK/YBwk='],
    ['a checksum with no body', 'sha512-'],
    ['a checksum with more before it', `x${SUM}`],
    ['a checksum with more after it', `${SUM} sha1-abc`],
  ])('should report %s', (_name, integrity) => {
    expect(detailsFor('node_modules/left-pad', { ...PAD, integrity })).toEqual([
      '"node_modules/left-pad" has no checksum.',
    ]);
  });

  describe('a name that stands for another package', () => {
    it('should pass a name the policy lists, with its package', () => {
      expect(detailsFor('node_modules/pad-cjs', PAD)).toEqual([]);
      expect(detailsFor('node_modules/a/node_modules/pad-cjs', PAD)).toEqual(
        [],
      );
    });

    it('should report a listed name that leads to a third package', () => {
      const entry = {
        ...PAD,
        resolved: 'https://registry.npmjs.org/pad-cjs/-/pad-cjs-1.2.3.tgz',
      };

      expect(detailsFor('node_modules/pad-cjs', entry)).toEqual([
        `"node_modules/pad-cjs" ${NOT_REGISTRY}`,
      ]);
    });

    it('should report a name the policy does not list', () => {
      expect(detailsFor('node_modules/other-pad', PAD)).toEqual([
        `"node_modules/other-pad" ${NOT_REGISTRY}`,
      ]);
    });
  });

  describe('a link', () => {
    it.each(['../elsewhere', 'docs', 'backend/src', ''])(
      'should report a link to %j',
      (resolved) => {
        const entry = { resolved, link: true };

        expect(detailsFor('node_modules/@scope/backend', entry)).toEqual([
          '"node_modules/@scope/backend" is a link to a folder ' +
            'that is not a workspace.',
        ]);
      },
    );

    it('should not take a package for a link when "link" is not true', () => {
      const entry = { resolved: 'backend', link: 'true' };

      expect(detailsFor('node_modules/@scope/backend', entry)).toEqual([
        `"node_modules/@scope/backend" ${NOT_REGISTRY}`,
      ]);
    });
  });

  it('should report a folder that is not a workspace', () => {
    expect(detailsFor('tools', { name: 'tools', version: '0.0.0' })).toEqual([
      '"tools" is a folder that is not a workspace.',
    ]);
  });

  it.each([null, 'left-pad', ['left-pad']])(
    'should report an entry that is %j',
    (entry) => {
      expect(detailsFor('node_modules/left-pad', entry)).toEqual([
        '"node_modules/left-pad" is not an object.',
      ]);
    },
  );

  it('should report every entry that is wrong, and only those', () => {
    const packages = {
      'node_modules/left-pad': PAD,
      'node_modules/a': { version: '1.0.0' },
      'node_modules/b': { version: '1.0.0' },
    };

    expect(detailsOf(lockOf(packages))).toEqual([
      `"node_modules/a" ${NOT_REGISTRY}`,
      `"node_modules/b" ${NOT_REGISTRY}`,
    ]);
  });

  describe('the shape of the lockfile', () => {
    it.each([1, 2, '3', null])(
      'should report a lockfile of version %j',
      (version) => {
        expect(detailsOf(lockOf({}, version))).toEqual([
          'The lockfile is not of version 3.',
        ]);
      },
    );

    it('should report a lockfile that names no version', () => {
      expect(detailsOf({ packages: {} })).toEqual([
        'The lockfile is not of version 3.',
      ]);
    });

    it.each([[[]], ['text'], [null]])(
      'should report a lockfile that is %j',
      (lockfile) => {
        expect(detailsOf(lockfile)).toEqual([
          'The lockfile is not of version 3.',
        ]);
      },
    );

    it.each([undefined, [], 'none'])(
      'should report a lockfile whose packages are %j',
      (packages) => {
        expect(detailsOf(lockOf(packages))).toEqual([
          'The lockfile has no "packages".',
        ]);
      },
    );
  });
});
