import { mkdirSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  LAST_VERDICT,
  readLastVerdict,
  writeLastVerdict,
} from '#harness/agents/last-verdict';
import { fingerprintOf } from '#harness/agents/tree';
import { useBench } from '#harness/tests/support/bench';

const bench = useBench();

describe('fingerprintOf', () => {
  const tree = (): string => fingerprintOf(bench.repository.root);

  it('should give one name to a tree that did not change', () => {
    bench.repository.write('src/a.ts', 'export const a = 1;\n');

    expect(tree()).toBe(tree());
    expect(tree()).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should change when the content of a file changes', () => {
    bench.repository.write('src/a.ts', 'export const a = 1;\n');
    const before = tree();
    bench.repository.write('src/a.ts', 'export const a = 2;\n');

    expect(tree()).not.toBe(before);
  });

  it('should change when a file that git does not know yet is written', () => {
    bench.repository.write('src/a.ts', 'export const a = 1;\n');
    bench.repository.commit();
    const before = tree();
    bench.repository.write('src/b.ts', '');

    expect(tree()).not.toBe(before);
  });

  it('should change when a file moves, with the same content', () => {
    bench.repository.write('src/a.ts', 'export const a = 1;\n');
    const before = tree();
    bench.repository.remove('src/a.ts');
    bench.repository.write('src/b.ts', 'export const a = 1;\n');

    expect(tree()).not.toBe(before);
  });

  it('should change when a file of the last commit is removed or emptied', () => {
    bench.repository.write('src/a.ts', 'export const a = 1;\n');
    bench.repository.commit();
    const before = tree();
    bench.repository.remove('src/a.ts');
    const removed = tree();
    bench.repository.write('src/a.ts', '');

    expect(removed).not.toBe(before);
    expect(tree()).not.toBe(removed);
  });

  it('should not change for a file that git ignores', () => {
    bench.repository.write('.gitignore', '/reports/\n');
    const before = tree();
    bench.repository.write('reports/gate/output.log', 'red\n');

    expect(tree()).toBe(before);
  });

  it('should take a link for where it points, not for what is there', () => {
    const { root } = bench.repository;
    bench.repository.write('real/a.json', '{}\n');
    bench.repository.write('real/b.json', '{}\n');
    mkdirSync(join(root, 'links'));
    symlinkSync('../real/a.json', join(root, 'links/to.json'));
    const toFirst = tree();
    unlinkSync(join(root, 'links/to.json'));
    symlinkSync('../real/b.json', join(root, 'links/to.json'));
    const toSecond = tree();
    unlinkSync(join(root, 'links/to.json'));
    writeFileSync(join(root, 'links/to.json'), '{}\n');

    expect(toSecond).not.toBe(toFirst);
    expect(tree()).not.toBe(toSecond);
  });

  it('should take a link that points nowhere as a link', () => {
    const { root } = bench.repository;
    symlinkSync('gone.json', join(root, 'to.json'));
    const dangling = tree();
    unlinkSync(join(root, 'to.json'));
    symlinkSync('other.json', join(root, 'to.json'));

    expect(tree()).not.toBe(dangling);
  });
});

describe('the last verdict', () => {
  it('should be kept in a folder of reports', () => {
    expect(LAST_VERDICT).toBe('reports/gate/last-verdict.json');
  });

  it('should be nothing before the first run', () => {
    expect(readLastVerdict(bench.repository.root)).toBeUndefined();
  });

  it('should come back as it was written, for a tree that passed', () => {
    const verdict = { tree: 'abc', redStep: undefined };
    writeLastVerdict(bench.repository.root, verdict);

    expect(readLastVerdict(bench.repository.root)).toEqual(verdict);
  });

  it('should come back as it was written, for a tree that was red', () => {
    const verdict = { tree: 'abc', redStep: 'lint' };
    writeLastVerdict(bench.repository.root, verdict);

    expect(readLastVerdict(bench.repository.root)).toEqual(verdict);
  });

  it('should replace the verdict that was there', () => {
    writeLastVerdict(bench.repository.root, { tree: 'a', redStep: 'lint' });
    writeLastVerdict(bench.repository.root, { tree: 'b', redStep: undefined });

    expect(readLastVerdict(bench.repository.root)).toEqual({
      tree: 'b',
      redStep: undefined,
    });
  });

  it.each([
    ['text that is not JSON', '{"tree":'],
    ['a list', '[]'],
    ['no tree', '{"redStep":"lint"}'],
    ['a tree that is not text', '{"tree":1}'],
  ])('should be nothing when the file holds %s', (_, text) => {
    bench.repository.write(LAST_VERDICT, text);

    expect(readLastVerdict(bench.repository.root)).toBeUndefined();
  });

  it('should take a red step that is not text as none', () => {
    bench.repository.write(LAST_VERDICT, '{"tree":"abc","redStep":3}');

    expect(readLastVerdict(bench.repository.root)).toEqual({
      tree: 'abc',
      redStep: undefined,
    });
  });
});
