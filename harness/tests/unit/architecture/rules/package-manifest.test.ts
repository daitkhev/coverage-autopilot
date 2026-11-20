import { describe, expect, it } from 'vitest';

import type { Rule } from '#harness/architecture/project';
import { packageManifest } from '#harness/architecture/rules/package-manifest';
import { structureOf } from '#harness/tests/support/policy-builder';
import {
  manifestOf,
  projectWith,
} from '#harness/tests/support/project-builder';

const rule = (): Rule => packageManifest(structureOf());
const IMPORTS = { '#store/*': './src/modules/store/*.ts' };
const DIFFERS = '"imports" differs from the alias table of the policy.';

function detailsFor(path: string, content: unknown): string[] {
  return rule()
    .check(projectWith(manifestOf(path, content)))
    .map((finding) => finding.detail);
}

describe('packageManifest', () => {
  it('should pass a workspace that holds what the policy lists', () => {
    const content = {
      name: '@scope/backend',
      version: '0.0.0',
      imports: IMPORTS,
      dependencies: { zod: '4.0.0', typescript: '6.0.0-beta.2' },
    };

    expect(detailsFor('backend/package.json', content)).toEqual([]);
  });

  it('should report a field the policy does not list', () => {
    const content = { imports: IMPORTS, scripts: { check: 'true' } };

    expect(
      rule().check(projectWith(manifestOf('backend/package.json', content))),
    ).toEqual([
      {
        rule: 'package-manifest',
        path: 'backend/package.json',
        line: 1,
        detail: 'The field "scripts" is not allowed in a workspace.',
      },
    ]);
  });

  describe('the alias table', () => {
    it('should report a table with one alias more', () => {
      const imports = { ...IMPORTS, '#other/*': '../frontend/src/*.ts' };

      expect(detailsFor('backend/package.json', { imports })).toEqual([
        DIFFERS,
      ]);
    });

    it('should report an alias that leads somewhere else', () => {
      const imports = { '#store/*': './src/modules/reports/*.ts' };

      expect(detailsFor('backend/package.json', { imports })).toEqual([
        DIFFERS,
      ]);
    });

    it('should report a workspace with no table', () => {
      expect(detailsFor('backend/package.json', {})).toEqual([DIFFERS]);
    });
  });

  it.each(['^4.0.0', '~4.0.0', '4.x', '>=4', 'latest', '*', 'file:../zod'])(
    'should report the version %s as not exact',
    (version) => {
      const content = { imports: IMPORTS, dependencies: { zod: version } };

      expect(detailsFor('backend/package.json', content)).toEqual([
        'The version of "zod" is not one exact version.',
      ]);
    },
  );

  it('should report a second manifest inside a workspace', () => {
    expect(detailsFor('backend/src/modules/package.json', {})).toEqual([
      'A workspace has one package.json, at its root.',
    ]);
  });

  it('should leave manifests outside the workspaces alone', () => {
    expect(detailsFor('package.json', { scripts: {} })).toEqual([]);
    expect(detailsFor('harness/fixtures/x/package.json', {})).toEqual([]);
  });
});
