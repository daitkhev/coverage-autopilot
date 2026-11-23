import { symlinkSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadProject } from '#harness/architecture/load-project';
import { useBench } from '#harness/tests/support/bench';
import { structureOf } from '#harness/tests/support/policy-builder';

const bench = useBench();

describe('loadProject', () => {
  function link(path: string, target: string): void {
    symlinkSync(target, join(bench.repository.root, path));
  }

  it('should give every path of the tree in order, links among them', () => {
    bench.repository.write('docs/notes.txt', 'a\n');
    bench.repository.write('backend/src/main.ts', 'export const a = 1;\n');
    bench.repository.write('README.md', 'a\n');
    link('a-link', 'README.md');
    link('docs/z-link', '../backend/src/main.ts');

    const project = loadProject(bench.repository.root, structureOf());

    expect(project.paths).toEqual([
      'README.md',
      'a-link',
      'backend/src/main.ts',
      'docs/notes.txt',
      'docs/z-link',
    ]);
    expect(project.files.map((file) => file.path)).toEqual([
      'backend/src/main.ts',
    ]);
  });

  it('should read a link as a link, with the target written in it', () => {
    bench.repository.write('backend/src/main.ts', 'export const a = 1;\n');
    link('backend/src/copy.ts', 'main.ts');
    link('nowhere', 'no-such-file');

    const project = loadProject(bench.repository.root, structureOf());

    expect([...project.links]).toEqual([
      ['backend/src/copy.ts', 'main.ts'],
      ['nowhere', 'no-such-file'],
    ]);
    expect(project.files.map((file) => file.path)).toEqual([
      'backend/src/main.ts',
    ]);
  });

  it('should leave out a file that git lists and the disk does not have', () => {
    bench.repository.write('docs/gone.txt', 'a\n');
    bench.repository.write('docs/kept.txt', 'a\n');
    bench.repository.commit();
    bench.repository.remove('docs/gone.txt');

    const project = loadProject(bench.repository.root, structureOf());

    expect(project.paths).toEqual(['docs/kept.txt']);
    expect([...project.links]).toEqual([]);
  });

  it('should give the lockfile of the root as it was parsed', () => {
    const lockfile = { lockfileVersion: 3, packages: {} };
    bench.repository.write('package-lock.json', JSON.stringify(lockfile));
    bench.repository.write('backend/package-lock.json', '{"other":true}');

    expect(loadProject(bench.repository.root, structureOf()).lockfile).toEqual(
      lockfile,
    );
  });

  it('should give no lockfile for a tree that has none at its root', () => {
    bench.repository.write('backend/package-lock.json', '{}');

    expect(
      loadProject(bench.repository.root, structureOf()).lockfile,
    ).toBeUndefined();
  });

  it('should not take a link named like the lockfile for one', () => {
    bench.repository.write('other.json', '{"lockfileVersion":3}');
    link('package-lock.json', 'other.json');

    expect(
      loadProject(bench.repository.root, structureOf()).lockfile,
    ).toBeUndefined();
  });
});
