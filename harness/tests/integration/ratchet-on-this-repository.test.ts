import { describe, expect, it } from '@jest/globals';

import { listFiles } from '#harness/architecture/files';
import { loadProject } from '#harness/architecture/load-project';
import { runRatchet } from '#harness/architecture/run';
import { readStructure, REPOSITORY_ROOT } from '#harness/shared/policy';

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
      'harness/architecture/run.ts',
    );
  });

  it('should give the same findings on two runs', () => {
    expect(runRatchet(REPOSITORY_ROOT)).toEqual(runRatchet(REPOSITORY_ROOT));
  });
});
