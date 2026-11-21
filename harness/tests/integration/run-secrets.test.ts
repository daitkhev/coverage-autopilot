import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { isShallow } from '#harness/architecture/git';
import { runSecrets } from '#harness/gate/run-secrets';
import { withCopyOfTree } from '#harness/gate/tree-copy';
import { HarnessError } from '#harness/shared/harness.error';
import { HARNESS_ROOT } from '#harness/shared/policy';
import { useBench } from '#harness/tests/support/bench';
import { fakeHost, type Run } from '#harness/tests/support/fake-host';

const bench = useBench();

const CONFIGS = join(HARNESS_ROOT, 'configs');
const COMMON = [
  '--no-banner',
  '--no-color',
  '--redact',
  '--verbose',
  '--config',
  join(CONFIGS, 'gitleaks.toml'),
  '--gitleaks-ignore-path',
  CONFIGS,
  '--ignore-gitleaks-allow',
];

/** Every file under a folder, from that folder, in order. */
function filesUnder(folder: string): string[] {
  return readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((entry) => !entry.isDirectory())
    .map((entry) => join(entry.parentPath, entry.name).slice(folder.length + 1))
    .sort();
}

describe('runSecrets', () => {
  const programOf = (name: string): string => `/tools/${name}`;

  function hostWhere(runs: (run: Run) => boolean): ReturnType<typeof fakeHost> {
    return fakeHost({ root: bench.repository.root, runs });
  }

  it('should search the history of the tree, then a copy of its files', () => {
    bench.repository.write('a.ts', 'export const a = 1;\n');
    const host = hostWhere(() => true);

    expect(runSecrets(host, programOf)).toBe(0);
    expect(host.ran.map((run) => run.program)).toEqual([
      '/tools/gitleaks',
      '/tools/gitleaks',
    ]);
    expect(host.ran[0]?.arguments).toEqual([
      'git',
      ...COMMON,
      '--log-opts=HEAD',
      bench.repository.root,
    ]);
    expect(host.ran[1]?.arguments.slice(0, -1)).toEqual(['dir', ...COMMON]);
    expect(host.ran[1]?.arguments.at(-1)).not.toBe(bench.repository.root);
  });

  it('should give the search only the files git sees', () => {
    bench.repository.write('.gitignore', '.env\n');
    bench.repository.write('.env', 'TOKEN=x\n');
    bench.repository.write('docs/deep/a.md', 'a\n');
    symlinkSync('docs/deep/a.md', join(bench.repository.root, 'a-link'));
    let seen: string[] = [];
    const host = hostWhere((run) => {
      if (run.arguments[0] === 'dir') {
        seen = filesUnder(run.arguments.at(-1) ?? '');
      }
      return true;
    });

    runSecrets(host, programOf);

    expect(seen).toEqual(['.gitignore', 'docs/deep/a.md']);
  });

  it('should remove the copy when the search is over', () => {
    bench.repository.write('a.ts', '');
    const host = hostWhere(() => false);

    runSecrets(host, programOf);

    expect(existsSync(host.ran[1]?.arguments.at(-1) ?? '')).toBe(false);
  });

  it.each([
    ['the history', 'git'],
    ['the files', 'dir'],
  ])('should fail when %s hold a secret, and search both', (_name, red) => {
    const host = hostWhere((run) => run.arguments[0] !== red);

    expect(runSecrets(host, programOf)).toBe(1);
    expect(host.ran).toHaveLength(2);
  });

  it('should refuse a clone that has a part of the history only', () => {
    bench.repository.write('a.ts', '');
    bench.repository.commit();
    bench.repository.write('a.ts', 'export const a = 1;\n');
    bench.repository.commit();
    const shallow = join(bench.repository.root, 'shallow');
    spawnSync('git', [
      'clone',
      '--quiet',
      '--depth',
      '1',
      `file://${bench.repository.root}`,
      shallow,
    ]);
    const host = fakeHost({ root: shallow });

    expect(isShallow(shallow)).toBe(true);
    expect(runSecrets(host, programOf)).toBe(1);
    expect(host.ran).toEqual([]);
    expect(host.printed).toEqual([
      'secrets: this clone has a part of the history only, ' +
        'so the history cannot be searched.',
    ]);
  });

  it('should take a clone with its whole history', () => {
    bench.repository.write('a.ts', '');
    bench.repository.commit();

    expect(isShallow(bench.repository.root)).toBe(false);
  });

  it('should fail, and search nothing, when the tool cannot be had', () => {
    const host = hostWhere(() => true);
    const none = (): string => {
      throw new HarnessError('gitleaks: no download');
    };

    expect(runSecrets(host, none)).toBe(1);
    expect(host.ran).toEqual([]);
    expect(host.printed).toEqual(['gitleaks: no download']);
  });
});

describe('withCopyOfTree', () => {
  it('should give what the use of the copy gives', () => {
    bench.repository.write('a.ts', 'export const a = 1;\n');

    expect(withCopyOfTree(bench.repository.root, filesUnder)).toEqual(['a.ts']);
  });

  it('should remove the copy when the use of it fails', () => {
    let copy = '';

    expect(() =>
      withCopyOfTree(bench.repository.root, (folder) => {
        copy = folder;
        throw new Error('the use failed');
      }),
    ).toThrow('the use failed');
    expect(copy).not.toBe('');
    expect(existsSync(copy)).toBe(false);
  });

  it('should leave out a file git lists and the disk does not have', () => {
    bench.repository.write('a.ts', '');
    bench.repository.write('b.ts', '');
    bench.repository.commit();
    bench.repository.remove('a.ts');

    expect(withCopyOfTree(bench.repository.root, filesUnder)).toEqual(['b.ts']);
  });
});
