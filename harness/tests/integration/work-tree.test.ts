import { mkdirSync, realpathSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { realOf, workTreeAt, workTreeOf } from '#harness/agents/work-tree';
import { useBench } from '#harness/tests/support/bench';
import {
  type TemporaryRepository,
  temporaryRepository,
} from '#harness/tests/support/temporary-repository';

const bench = useBench();

/** Where git puts the tree of an agent that works beside others. */
const LINKED = '.claude/worktrees/agent-a';

describe('workTreeAt', () => {
  const first = (): string => realpathSync(bench.repository.root);

  /** A second tree of the repository, and its real root. */
  function linked(): string {
    bench.repository.write('src/a.ts', '');
    bench.repository.commit();
    return realpathSync(bench.repository.link(LINKED, 'feat/a'));
  }

  it('should know the first tree by its root', () => {
    expect(workTreeAt(first(), first())).toEqual({
      root: first(),
      linked: false,
    });
  });

  it('should know the first tree by a folder inside it', () => {
    mkdirSync(join(first(), 'src/deep'), { recursive: true });

    expect(workTreeAt(join(first(), 'src/deep'), first())).toEqual({
      root: first(),
      linked: false,
    });
  });

  it('should know a linked tree, which is inside the first one', () => {
    const tree = linked();

    expect(workTreeAt(join(tree, 'src'), first())).toEqual({
      root: tree,
      linked: true,
    });
  });

  it('should take any folder of the repository as its name', () => {
    const tree = linked();

    expect(workTreeAt(tree, join(tree, 'src'))).toEqual({
      root: tree,
      linked: true,
    });
    expect(workTreeAt(first(), tree)).toEqual({
      root: first(),
      linked: false,
    });
  });

  it('should know a tree by another name of its folder', () => {
    const alias = `${first()}-by-another-name`;
    symlinkSync(first(), alias);

    expect(workTreeAt(alias, first())?.root).toBe(first());
    expect(workTreeAt(first(), alias)?.root).toBe(first());
  });

  it.each([
    ['in no repository', (): string => realpathSync(tmpdir())],
    ['that does not exist', (): string => join(first(), 'not/made')],
    ['that git keeps its own files in', (): string => join(first(), '.git')],
  ])('should give nothing for a folder %s', (_, folder) => {
    expect(workTreeAt(folder(), first())).toBeUndefined();
  });

  it('should refuse a name that is in no tree of git', () => {
    expect(() => workTreeAt(first(), realpathSync(tmpdir()))).toThrow(
      ' is not in a tree of git.',
    );
    expect(() => workTreeAt(first(), '/nowhere')).toThrow(
      '/nowhere is not in a tree of git.',
    );
  });
});

describe('workTreeAt, with a second repository', () => {
  let other: TemporaryRepository;

  beforeEach(() => {
    other = temporaryRepository();
  });

  afterEach(() => {
    other.dispose();
  });

  it('should give nothing for a tree of another repository', () => {
    expect(workTreeAt(other.root, bench.repository.root)).toBeUndefined();
  });

  it('should give nothing for a linked tree of another repository', () => {
    other.commit();
    const tree = other.link('linked', 'feat/b');

    expect(workTreeAt(tree, bench.repository.root)).toBeUndefined();
    expect(workTreeAt(tree, other.root)?.linked).toBe(true);
  });
});

describe('workTreeOf', () => {
  const first = (): string => realpathSync(bench.repository.root);

  it('should find the tree of a file that is written', () => {
    bench.repository.write('src/a.ts', '');

    expect(workTreeOf(join(first(), 'src/a.ts'), first())?.root).toBe(first());
  });

  it('should find the tree of a file in a folder that is not made yet', () => {
    expect(workTreeOf(join(first(), 'not/made/a.ts'), first())?.root).toBe(
      first(),
    );
  });

  it('should judge a file by where it really is', () => {
    bench.repository.write('src/a.ts', '');
    bench.repository.commit();
    const tree = realpathSync(bench.repository.link(LINKED, 'feat/a'));
    symlinkSync(join(tree, 'src'), join(first(), 'way-in'));

    expect(workTreeOf(join(first(), 'way-in/a.ts'), first())).toEqual({
      root: tree,
      linked: true,
    });
  });

  it('should give nothing for a file outside the repository', () => {
    expect(workTreeOf(join(first(), '../a.ts'), first())).toBeUndefined();
    expect(workTreeOf('/nowhere/at/all/a.ts', first())).toBeUndefined();
  });
});

describe('realOf', () => {
  it('should follow a link in the part of the path that exists', () => {
    const real = realpathSync(bench.repository.root);
    symlinkSync(real, `${real}-link`);

    expect(realOf(join(`${real}-link`, 'not/made/a.ts'))).toBe(
      join(real, 'not/made/a.ts'),
    );
  });
});
