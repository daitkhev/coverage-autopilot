import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { changedFilesOf, runGuard, sortChange } from '#harness/gate/run-guard';
import { type FrozenPolicy, readFrozenPolicy } from '#harness/shared/frozen';
import { useBench } from '#harness/tests/support/bench';

const bench = useBench();

const POLICY: FrozenPolicy = {
  places: ['harness/', '.github/', '*'],
  names: ['tsconfig*.json'],
  free: ['harness/baseline.json', 'README.md', 'package-lock.json'],
  withPolicy: ['harness/baseline.json', 'package-lock.json'],
};
const LIST = 'files.jsonl';
const USAGE = 'usage: guard.ts <list of files> <how many files>';
const SPLIT =
  'guard: a change of the policy and a change of anything else ' +
  'do not land together. Split them into two pull requests.';

/** One file as the API of GitHub lists it. */
function fileOf(filename: string, previous?: string): string {
  return JSON.stringify({
    sha: 'abc',
    filename,
    status: previous === undefined ? 'modified' : 'renamed',
    previous_filename: previous,
  });
}

describe('runGuard', () => {
  /** Judges a change of these files, listed in full. */
  function guard(lines: readonly string[], count = lines.length): number {
    bench.repository.write(LIST, lines.map((line) => `${line}\n`).join(''));
    return runGuard(
      [join(bench.repository.root, LIST), String(count)],
      bench.host,
      POLICY,
    );
  }

  it('should pass a change of the code only', () => {
    expect(guard([fileOf('backend/src/main.ts'), fileOf('docs/a.md')])).toBe(0);
    expect(bench.host.printed).toEqual([
      'guard: passed, 0 file(s) of the policy and 2 other file(s)',
    ]);
  });

  it('should pass a change of the policy only', () => {
    const lines = [
      fileOf('harness/policy/limits.json'),
      fileOf('.github/workflows/ci.yml'),
      fileOf('package.json'),
      fileOf('backend/tsconfig.json'),
    ];

    expect(guard(lines)).toBe(0);
    expect(bench.host.printed).toEqual([
      'guard: passed, 4 file(s) of the policy and 0 other file(s)',
    ]);
  });

  it('should pass a change of nothing', () => {
    expect(guard([])).toBe(0);
  });

  it('should refuse the policy with one file of code', () => {
    const lines = [
      fileOf('harness/policy/limits.json'),
      fileOf('backend/src/main.ts'),
    ];

    expect(guard(lines)).toBe(1);
    expect(bench.host.printed).toEqual([
      'policy: harness/policy/limits.json\nother:  backend/src/main.ts',
      SPLIT,
    ]);
  });

  it.each(['docs/plan/harness.md', 'README.md', 'backend/package.json'])(
    'should refuse the policy with %s',
    (path) => {
      expect(guard([fileOf('package.json'), fileOf(path)])).toBe(1);
    },
  );

  it.each(['package-lock.json', 'harness/baseline.json'])(
    'should pass %s with the policy, and with the code',
    (path) => {
      expect(guard([fileOf('package.json'), fileOf(path)])).toBe(0);
      expect(guard([fileOf('backend/src/main.ts'), fileOf(path)])).toBe(0);
    },
  );

  it('should refuse a mixed change whatever goes with either', () => {
    const lines = [
      fileOf('package.json'),
      fileOf('package-lock.json'),
      fileOf('backend/package.json'),
    ];

    expect(guard(lines)).toBe(1);
    expect(bench.host.printed.at(0)).toBe(
      'policy: package.json\nother:  backend/package.json',
    );
  });

  it('should count a file moved out of the policy as policy', () => {
    const lines = [
      fileOf('backend/src/check.ts', 'harness/bin/check.ts'),
      fileOf('backend/src/main.ts'),
    ];

    expect(guard(lines)).toBe(1);
    expect(bench.host.printed.at(0)).toBe(
      'policy: harness/bin/check.ts\n' +
        'other:  backend/src/check.ts\n' +
        'other:  backend/src/main.ts',
    );
  });

  it('should count a file moved into the policy as code too', () => {
    expect(guard([fileOf('harness/gate/new.ts', 'backend/src/old.ts')])).toBe(
      1,
    );
  });

  it('should pass a file moved inside the policy', () => {
    expect(guard([fileOf('harness/gate/b.ts', 'harness/gate/a.ts')])).toBe(0);
  });

  it('should count a removed file of the policy', () => {
    const removed = JSON.stringify({
      filename: 'harness/git/pre-push',
      status: 'removed',
    });

    expect(guard([removed, fileOf('backend/src/main.ts')])).toBe(1);
  });

  describe('a list that is not the whole change', () => {
    it('should refuse a list that is shorter than the change', () => {
      const lines = [fileOf('backend/src/a.ts'), fileOf('backend/src/b.ts')];

      expect(guard(lines, lines.length + 1)).toBe(1);
      expect(bench.host.printed).toEqual([
        'guard: the list has 2 of the 3 files of the change. ' +
          'A part is not judged.',
      ]);
    });

    it('should refuse a list that is longer than the change', () => {
      expect(guard([fileOf('backend/src/a.ts')], 0)).toBe(1);
    });

    it('should count a moved file once', () => {
      expect(guard([fileOf('docs/b.md', 'docs/a.md')], 1)).toBe(0);
    });

    it('should not count an empty line', () => {
      bench.repository.write(LIST, `\n${fileOf('docs/a.md')}\n  \n\n`);

      expect(
        runGuard([join(bench.repository.root, LIST), '1'], bench.host, POLICY),
      ).toBe(0);
    });
  });

  describe('what it is started with', () => {
    it.each([
      ['no argument', []],
      ['no number', [LIST]],
      ['an empty number', [LIST, '']],
      ['a word for a number', [LIST, 'many']],
      ['a part of a file', [LIST, '1.5']],
    ])('should refuse %s', (_name, given) => {
      bench.repository.write(LIST, '');
      const [list, ...rest] = given;
      const arguments_ =
        list === undefined ? [] : [join(bench.repository.root, list), ...rest];

      expect(runGuard(arguments_, bench.host, POLICY)).toBe(1);
      expect(bench.host.printed).toEqual([USAGE]);
    });

    it.each([
      ['a line that is not JSON', 'backend/src/main.ts'],
      ['a line that is not an object', '["backend/src/main.ts"]'],
      ['a file with no name', '{"status":"modified"}'],
      ['a name that is not a text', '{"filename":7}'],
    ])('should refuse %s', (_name, line) => {
      expect(guard([line])).toBe(1);
      expect(bench.host.printed).toEqual([
        `The list of files has a line it cannot read: ${line}`,
      ]);
    });

    it('should let a fault that is not its own go on', () => {
      const missing = join(bench.repository.root, 'no-such-list');

      expect(() => runGuard([missing, '0'], bench.host, POLICY)).toThrow(
        'ENOENT',
      );
    });
  });
});

describe('changedFilesOf', () => {
  it('should give each file as its names, the new one first', () => {
    const text = `${fileOf('a.ts')}\n${fileOf('c.ts', 'b.ts')}\n`;

    expect(changedFilesOf(text)).toEqual([['a.ts'], ['c.ts', 'b.ts']]);
  });

  it('should take an earlier name that is no text for none', () => {
    expect(
      changedFilesOf('{"filename":"a.ts","previous_filename":null}'),
    ).toEqual([['a.ts']]);
  });
});

describe('sortChange', () => {
  it('should sort the names by the policy of this repository', () => {
    const names = [
      'AGENTS.md',
      '.claude/settings.json',
      '.codex/hooks.json',
      'harness/fixtures/ratchet/a/expected.json',
      'frontend/tsconfig.json',
      'README.md',
      'package-lock.json',
      'harness/baseline.json',
      'frontend/src/app/main.tsx',
    ];

    expect(sortChange(names, readFrozenPolicy())).toEqual({
      policy: names.slice(0, 5),
      other: ['README.md', 'frontend/src/app/main.tsx'],
    });
  });
});
