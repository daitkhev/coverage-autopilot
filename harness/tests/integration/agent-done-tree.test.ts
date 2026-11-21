import { mkdirSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { treeToJudge } from '#harness/agents/done-tree';
import { useBench } from '#harness/tests/support/bench';

const bench = useBench();

describe('treeToJudge', () => {
  const first = (): string => realpathSync(bench.repository.root);

  /** A second tree of the repository, and its real root. */
  function linked(): string {
    bench.repository.commit();
    return realpathSync(
      bench.repository.link('.claude/worktrees/agent-a', 'feat/a'),
    );
  }

  /** The tree that is judged for an agent that stops in this folder. */
  function judged(folder: unknown, event = 'Stop'): string | undefined {
    const call = { hook_event_name: event, cwd: folder };
    return treeToJudge(JSON.stringify(call), first());
  }

  it('should judge the first tree for an agent that works in it', () => {
    mkdirSync(join(first(), 'backend/src'), { recursive: true });

    expect(judged(first())).toBe(first());
    expect(judged(join(first(), 'backend/src'))).toBe(first());
  });

  it('should judge the linked tree of an agent that works in one', () => {
    const tree = linked();
    mkdirSync(join(tree, 'backend'));

    expect(judged(join(tree, 'backend'))).toBe(tree);
  });

  it.each([
    ['a folder outside the repository', (): unknown => realpathSync(tmpdir())],
    ['a folder that does not exist', (): unknown => '/nowhere/at/all'],
    ['no folder', (): unknown => undefined],
    ['a folder that is not text', (): unknown => 1],
  ])('should judge the first tree for an agent that names %s', (_, folder) => {
    expect(judged(folder())).toBe(first());
  });

  it.each([
    ['text that is not JSON', 'nope'],
    ['a list', '[]'],
    ['nothing', ''],
  ])('should judge the first tree when the input holds %s', (_, input) => {
    expect(treeToJudge(input, first())).toBe(first());
  });

  it('should judge a helper that has a tree of its own', () => {
    const tree = linked();

    expect(judged(tree, 'SubagentStop')).toBe(tree);
  });

  it.each([
    ['in the first tree', (): unknown => first()],
    ['outside the repository', (): unknown => realpathSync(tmpdir())],
    ['in no folder', (): unknown => undefined],
  ])('should not judge a helper that works %s', (_, folder) => {
    expect(judged(folder(), 'SubagentStop')).toBeUndefined();
  });
});
