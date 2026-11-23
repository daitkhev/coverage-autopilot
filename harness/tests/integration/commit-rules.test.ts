import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { COMMIT_RULES, readCommitTypes } from '#harness/gate/commit-rules';
import { REPOSITORY_ROOT } from '#harness/shared/policy';
import { useBench } from '#harness/tests/support/bench';

const bench = useBench();

const ERROR = 2;

function rules(): Record<string, unknown> {
  const text = readFileSync(join(REPOSITORY_ROOT, COMMIT_RULES), 'utf8');
  return (JSON.parse(text) as { rules: Record<string, unknown> }).rules;
}

describe('commitlint.json', () => {
  it('should give the types a commit and a branch start with', () => {
    expect(readCommitTypes()).toEqual([
      'build',
      'chore',
      'ci',
      'docs',
      'feat',
      'fix',
      'perf',
      'refactor',
      'revert',
      'style',
      'test',
    ]);
  });

  it.each([
    ['no rule of types', {}],
    ['a rule that is no list', { 'type-enum': 'feat' }],
    ['a rule with no value', { 'type-enum': [ERROR, 'always'] }],
    ['a type that is no text', { 'type-enum': [ERROR, 'always', ['feat', 7]] }],
  ])('should refuse rules with %s', (_name, shape) => {
    bench.repository.write('rules.json', JSON.stringify({ rules: shape }));
    const path = join(bench.repository.root, 'rules.json');

    expect(() => readCommitTypes(path)).toThrow(
      'harness/configs/commitlint.json has no list of types.',
    );
  });

  it('should take no scope but the one of a dependency update', () => {
    expect(rules()['scope-enum']).toEqual([
      ERROR,
      'always',
      ['deps', 'deps-dev'],
    ]);
  });

  it('should hold a header at the width of a line', () => {
    expect(rules()['header-max-length']).toEqual([ERROR, 'always', 80]);
  });

  it('should have no rule that only warns, and none that is off', () => {
    const levels = Object.values(rules()).map((rule) =>
      Array.isArray(rule) ? (rule[0] as unknown) : rule,
    );

    expect(new Set(levels)).toEqual(new Set([ERROR]));
  });

  it('should load no rule from elsewhere', () => {
    const text = readFileSync(join(REPOSITORY_ROOT, COMMIT_RULES), 'utf8');

    expect(Object.keys(JSON.parse(text) as object)).toEqual(['rules']);
  });
});
