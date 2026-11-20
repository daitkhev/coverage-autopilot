import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from '@jest/globals';

import { TOOLS } from '#harness/gate/tools';
import { isRecord, readJsonRecord, recordAt } from '#harness/shared/json';
import { HARNESS_ROOT, REPOSITORY_ROOT } from '#harness/shared/policy';
import { readStructure } from '#harness/shared/structure';

function config(name: string): Record<string, unknown> {
  return readJsonRecord(join(HARNESS_ROOT, 'configs', name));
}

const FIXTURES = 'harness/fixtures/**';

describe('the tools of the gate', () => {
  it.each(Object.entries(TOOLS))('should find %s at its path', (_, script) => {
    expect(existsSync(join(REPOSITORY_ROOT, script))).toBe(true);
  });

  it('should have each of them as an exact dependency of the root', () => {
    const root = readJsonRecord(join(REPOSITORY_ROOT, 'package.json'));
    const declared = Object.keys(recordAt(root, 'devDependencies'));

    expect(declared).toEqual(expect.arrayContaining(Object.keys(TOOLS)));
  });
});

describe('knip.json', () => {
  const workspaces = recordAt(config('knip.json'), 'workspaces');
  const root = recordAt(workspaces, '.');

  it('should leave out of the root only the fixtures', () => {
    expect(root['ignore']).toEqual([FIXTURES]);
  });

  it('should excuse only the tools the gate starts by a path', () => {
    expect(Object.keys(TOOLS)).toEqual(
      expect.arrayContaining(root['ignoreDependencies'] as string[]),
    );
  });

  it('should know every workspace of the policy, and ignore none', () => {
    const names = ['.', ...readStructure().workspaces.keys()].sort();

    expect(Object.keys(workspaces).sort()).toEqual(names);
    for (const name of readStructure().workspaces.keys()) {
      const workspace = recordAt(workspaces, name);

      expect(Object.keys(workspace).sort()).toEqual(['entry', 'project']);
    }
  });

  it('should switch off nothing at the top of the file', () => {
    expect(Object.keys(config('knip.json'))).toEqual(['workspaces']);
  });
});

describe('jscpd.json', () => {
  it('should read every TypeScript file but the fixtures', () => {
    expect(config('jscpd.json')).toEqual({
      pattern: '**/*.{ts,tsx}',
      ignore: ['**/node_modules/**', FIXTURES],
      reporters: ['console'],
      gitignore: true,
    });
  });
});

describe('jest.json', () => {
  it('should measure the whole harness but its fixtures and its tests', () => {
    expect(config('jest.json')['collectCoverageFrom']).toEqual([
      'harness/**/*.ts',
      '!harness/fixtures/**',
      '!harness/tests/**',
    ]);
  });

  it('should write the report where the coverage step reads it', () => {
    const jest = config('jest.json');

    expect(jest['coverageDirectory']).toBe('<rootDir>/coverage/harness');
    expect(jest['coverageReporters']).toContain('json');
  });

  it('should hold no floor of its own: the floors are in the policy', () => {
    expect(config('jest.json')['coverageThreshold']).toBeUndefined();
  });
});

describe('markdownlint.json', () => {
  const rules = recordAt(config('markdownlint.json'), 'config');

  it('should start from every rule and switch none off', () => {
    expect(rules['default']).toBe(true);
    expect(Object.values(rules).filter((value) => value === false)).toEqual([]);
  });

  it('should hold a line at 80 characters, tables and code aside', () => {
    expect(rules['MD013']).toEqual({
      line_length: 80,
      tables: false,
      code_blocks: false,
    });
    expect(isRecord(rules['MD013'])).toBe(true);
  });
});
