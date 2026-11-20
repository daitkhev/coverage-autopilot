import { describe, expect, it } from 'vitest';

import type { Policy } from '#harness/architecture/policy';
import type { Rule } from '#harness/architecture/project';
import {
  packageNameOf,
  packagePlacement,
} from '#harness/architecture/rules/package-placement';
import {
  MODULES,
  packageRule,
  structureOf,
} from '#harness/tests/support/policy-builder';
import {
  importFrom,
  importOf,
  importTo,
  manifestOf,
  projectOf,
  projectWith,
  sourceFile,
} from '#harness/tests/support/project-builder';

const APPLICATION = `${MODULES}/*/application/`;
const INFRASTRUCTURE = `${MODULES}/*/infrastructure/`;

const policy: Policy = {
  structure: structureOf(),
  packages: [
    packageRule({ packages: ['node:*', 'typescript'], places: ['harness/'] }),
    packageRule({
      packages: ['framework'],
      places: [APPLICATION],
      names: ['Inject', 'Injectable'],
    }),
    packageRule({ packages: ['framework'], places: [INFRASTRUCTURE] }),
    packageRule({ packages: ['node:fs'], places: [INFRASTRUCTURE] }),
    packageRule({ packages: ['@scope/schemas'], places: [INFRASTRUCTURE] }),
  ],
};
const rule = (): Rule => packagePlacement(policy);

function detailsFor(path: string, specifier: string, ...names: string[]) {
  const file = sourceFile(path, [importFrom(specifier, ...names)]);
  return rule()
    .check(projectOf(file))
    .map((finding) => finding.detail);
}

describe('packageNameOf', () => {
  it.each([
    ['zod', 'zod'],
    ['zod/v4', 'zod'],
    ['@scope/name', '@scope/name'],
    ['@scope/name/deep/file', '@scope/name'],
    ['node:fs', 'node:fs'],
    ['node:fs/promises', 'node:fs'],
  ])('should read %s as the package %s', (specifier, name) => {
    expect(packageNameOf(specifier)).toBe(name);
  });
});

describe('packagePlacement', () => {
  it('should report a package the policy does not list', () => {
    const file = sourceFile(`${MODULES}/store/infrastructure/reader.ts`, [
      importOf({ specifier: 'lodash/merge', kind: 'package', line: 3 }),
    ]);

    expect(rule().check(projectOf(file))).toEqual([
      {
        rule: 'package-placement',
        path: `${MODULES}/store/infrastructure/reader.ts`,
        line: 3,
        detail: '"lodash" is not in packages.json.',
      },
    ]);
  });

  it('should report a listed package in a place it is not allowed in', () => {
    expect(
      detailsFor(`${MODULES}/store/domain/item.ts`, 'framework', 'Injectable'),
    ).toEqual(['"framework" may not be imported here.']);
  });

  it('should pass a listed package in its place', () => {
    expect(
      detailsFor(`${MODULES}/store/infrastructure/reader.ts`, 'framework', '*'),
    ).toEqual([]);
    expect(
      detailsFor(
        `${MODULES}/store/infrastructure/reader.ts`,
        '@scope/schemas/item',
        'item',
      ),
    ).toEqual([]);
  });

  describe('when a place allows only some names', () => {
    const handler = `${MODULES}/store/application/find.handler.ts`;

    it('should pass the names it allows', () => {
      expect(detailsFor(handler, 'framework', 'Inject', 'Injectable')).toEqual(
        [],
      );
    });

    it('should report any other name', () => {
      expect(detailsFor(handler, 'framework', 'Injectable', 'Logger')).toEqual([
        'Only Inject, Injectable may be imported from "framework" here.',
      ]);
    });

    it('should report an import of everything', () => {
      expect(detailsFor(handler, 'framework', '*')).toHaveLength(1);
    });

    it('should report an import that takes no name', () => {
      expect(detailsFor(handler, 'framework')).toHaveLength(1);
    });
  });

  describe('modules built into Node', () => {
    it('should pass one that is listed for the place, with a subpath', () => {
      expect(
        detailsFor(
          `${MODULES}/store/infrastructure/reader.ts`,
          'node:fs/promises',
          'readFile',
        ),
      ).toEqual([]);
    });

    it('should report one that is listed only for another place', () => {
      expect(
        detailsFor(
          `${MODULES}/store/infrastructure/reader.ts`,
          'node:net',
          'connect',
        ),
      ).toEqual(['"node:net" may not be imported here.']);
    });

    it('should pass any of them where the policy allows them all', () => {
      expect(detailsFor('harness/bin/check.ts', 'node:net', 'connect')).toEqual(
        [],
      );
    });
  });

  it('should leave aliases and relative imports to other rules', () => {
    const file = sourceFile(`${MODULES}/store/domain/item.ts`, [
      importTo(`${MODULES}/store/domain/price.ts`),
      importOf({ specifier: './price', kind: 'relative' }),
    ]);

    expect(rule().check(projectOf(file))).toEqual([]);
  });

  describe('what a workspace declares', () => {
    it('should report a declared package the policy does not list', () => {
      const project = projectWith(
        manifestOf('backend/package.json', {
          dependencies: { framework: '1.0.0', typeorm: '1.0.0' },
          devDependencies: { prisma: '1.0.0' },
        }),
      );

      expect(rule().check(project)).toEqual([
        {
          rule: 'package-placement',
          path: 'backend/package.json',
          line: 1,
          detail: '"typeorm" is declared and is not in packages.json.',
        },
        {
          rule: 'package-placement',
          path: 'backend/package.json',
          line: 1,
          detail: '"prisma" is declared and is not in packages.json.',
        },
      ]);
    });

    it('should leave the root package to the frozen files check', () => {
      const project = projectWith(
        manifestOf('package.json', { devDependencies: { anything: '1.0.0' } }),
      );

      expect(rule().check(project)).toEqual([]);
    });

    it('should read a manifest that is not an object as empty', () => {
      const project = projectWith(manifestOf('backend/package.json', []));

      expect(rule().check(project)).toEqual([]);
    });
  });
});
