import { describe, expect, it } from 'vitest';

import { anchorsOf, linkFindings, linksOf } from '#harness/documents/links';

describe('anchorsOf', () => {
  it('should make an anchor the way GitHub does', () => {
    const text = [
      '# Harness',
      '## Who judges the judge',
      '### Check, write, compare',
      '## What it checks: A/B (v2)',
      '## The `fast` profile and *why*',
      '## See [the gate](#the-gate) first',
      '## snake_case stays',
    ].join('\n');

    expect(anchorsOf(text)).toEqual([
      'harness',
      'who-judges-the-judge',
      'check-write-compare',
      'what-it-checks-ab-v2',
      'the-fast-profile-and-why',
      'see-the-gate-first',
      'snake_case-stays',
    ]);
  });

  it('should number a heading that repeats', () => {
    expect(anchorsOf('## Tests\n## Tests\n## Tests\n')).toEqual([
      'tests',
      'tests-1',
      'tests-2',
    ]);
  });

  it('should not take a line of code for a heading', () => {
    const text =
      '# Real\n```sh\n# a comment in a script\n```\n~~~\n# too\n~~~\n';

    expect(anchorsOf(text)).toEqual(['real']);
  });

  it('should read a heading closed with hashes', () => {
    expect(anchorsOf('## Closed ##\n')).toEqual(['closed']);
  });
});

describe('linksOf', () => {
  it('should read links and pictures with their lines', () => {
    const text = [
      'See [the design](system-design.md#queue) and [more](a.md "A title").',
      '',
      '![a screen](mockups/screen.png)',
    ].join('\n');

    expect(linksOf(text)).toEqual([
      { target: 'system-design.md#queue', line: 1 },
      { target: 'a.md', line: 1 },
      { target: 'mockups/screen.png', line: 3 },
    ]);
  });

  it('should read a target in angle brackets', () => {
    expect(linksOf('[a](<docs/a.md>)')).toEqual([
      { target: 'docs/a.md', line: 1 },
    ]);
  });

  it('should not read code for links', () => {
    const text = 'Write `[text](target.md)` like so:\n```md\n[a](b.md)\n```\n';

    expect(linksOf(text)).toEqual([]);
  });
});

describe('linkFindings', () => {
  const files = new Set([
    'README.md',
    'docs/plan/a.md',
    'docs/plan/b.md',
    'docs/plan/mockups/screen.png',
    'harness/bin/check.ts',
  ]);

  function detailsFor(text: string): string[] {
    const documents = [
      { path: 'docs/plan/a.md', text },
      { path: 'docs/plan/b.md', text: '# B\n## The queue\n' },
    ];
    return linkFindings(documents, files).map((finding) => finding.detail);
  }

  it('should pass links that lead to files and headings of the tree', () => {
    const text = [
      '# A',
      '[b](b.md), [queue](b.md#the-queue), [here](#a), [top](b.md#)',
      '[up](../../README.md), [code](../../harness/bin/check.ts)',
      '![screen](mockups/screen.png), [folder](mockups/), [too](mockups)',
    ].join('\n');

    expect(detailsFor(text)).toEqual([]);
  });

  it('should report a link to a file that is not in the tree', () => {
    const findings = linkFindings(
      [{ path: 'docs/plan/a.md', text: 'one\n\nsee [c](c.md#x)\n' }],
      files,
    );

    expect(findings).toEqual([
      {
        rule: 'dead-link',
        path: 'docs/plan/a.md',
        line: 3,
        detail: '"c.md#x" leads to no file.',
      },
    ]);
  });

  it('should report a link to a heading that is not there', () => {
    expect(detailsFor('# A\n[x](b.md#the-lease) and [y](#gone)\n')).toEqual([
      '"b.md#the-lease" leads to no heading.',
      '"#gone" leads to no heading.',
    ]);
  });

  it('should not read what is outside the tree', () => {
    const text = '[site](https://example.com/a#b) [mail](mailto:a@example.com)';

    expect(detailsFor(text)).toEqual([]);
  });

  it('should not check a heading in a file that is not a document', () => {
    expect(detailsFor('[line](../../harness/bin/check.ts#L3)')).toEqual([]);
  });

  it('should read an escaped path as the path it names', () => {
    const withSpace = new Set(['docs/plan/a.md', 'docs/plan/my file.md']);
    const documents = [{ path: 'docs/plan/a.md', text: '[f](my%20file.md)' }];

    expect(linkFindings(documents, withSpace)).toEqual([]);
  });
});
