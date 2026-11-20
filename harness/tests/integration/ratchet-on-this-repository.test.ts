import { join } from 'node:path';

import { describe, expect, it } from '@jest/globals';

import { checkTree } from '#harness/architecture/commands';
import { listFiles } from '#harness/architecture/files';
import { loadProject } from '#harness/architecture/load-project';
import { runRatchet } from '#harness/architecture/run';
import { readJsonRecord } from '#harness/shared/json';
import { REPOSITORY_ROOT } from '#harness/shared/policy';
import { readStructure } from '#harness/shared/structure';

describe('ratchet on this repository', () => {
  it('should list files sorted, as git sees them', () => {
    const files = listFiles(REPOSITORY_ROOT);

    expect(files).toContain('package.json');
    expect(files).toEqual([...files].sort());
    expect(files.some((path) => path.startsWith('node_modules/'))).toBe(false);
  });

  it('should measure the harness and leave its fixtures out', () => {
    const paths = loadProject(REPOSITORY_ROOT, readStructure()).files.map(
      (file) => file.path,
    );

    expect(paths).toContain('harness/bin/ratchet.ts');
    expect(paths.some((path) => path.includes('/fixtures/'))).toBe(false);
  });

  it('should follow the alias of the root package', () => {
    const project = loadProject(REPOSITORY_ROOT, readStructure());
    const command = project.files.find(
      (file) => file.path === 'harness/bin/ratchet.ts',
    );

    expect(command?.imports.map((record) => record.target)).toContain(
      'harness/architecture/ratchet-command.ts',
    );
  });

  it('should read the package of every workspace of the policy', () => {
    const project = loadProject(REPOSITORY_ROOT, readStructure());
    const paths = project.manifests.map((manifest) => manifest.path);

    for (const workspace of readStructure().workspaces.keys()) {
      expect(paths).toContain(`${workspace}/package.json`);
    }
  });

  it('should have the workspaces the policy lists, and no other', () => {
    const root = readJsonRecord(join(REPOSITORY_ROOT, 'package.json'));

    expect(root['workspaces']).toEqual(
      [...readStructure().workspaces.keys()].sort(),
    );
  });

  it('should have no finding and match its baseline', () => {
    expect(checkTree(REPOSITORY_ROOT)).toEqual({ findings: [], notes: [] });
  });

  it('should give the same findings on two runs', () => {
    expect(runRatchet(REPOSITORY_ROOT)).toEqual(runRatchet(REPOSITORY_ROOT));
  });
});
