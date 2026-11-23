import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import { type Host, processHost } from '#harness/gate/host';
import { outsideProgram } from '#harness/gate/outside-program';
import { runSecrets } from '#harness/gate/run-secrets';
import { runWorkflows } from '#harness/gate/run-workflows';
import { useBench } from '#harness/tests/support/bench';

const bench = useBench();

/** The first download of a tool takes longer than a test usually may. */
const WITH_DOWNLOAD = 120_000;

/**
 * A made-up token in the shape of a real one. It is joined here from
 * parts, so the search for secrets finds nothing in this file itself.
 */
const TOKEN = [
  'ghp',
  '_k3Jd9LqP',
  'x7Vb2NmT',
  'r5Wz8HcY',
  'f1Gs4UaE',
  'o6Qi',
].join('');

interface Heard extends Host {
  /** What the tools said, in one text. */
  readonly said: () => string;
}

/** The real machine on the temporary tree, with the tools kept quiet. */
function hostOnBench(): Heard {
  const said: string[] = [];
  return {
    ...processHost,
    root: bench.repository.root,
    said: () => said.join('\n'),
    print: (text) => {
      said.push(text);
    },
    run: (program, arguments_) => {
      const run = spawnSync(program, arguments_, { encoding: 'utf8' });
      said.push(run.stdout + run.stderr);
      return run.status === 0;
    },
  };
}

/**
 * The real tools run here on small trees, right ones and wrong ones. They
 * are programs that the harness downloads, so the first run needs the
 * network.
 */
describe('the search for secrets, with real gitleaks', () => {
  function secrets(): { code: number; said: string } {
    const host = hostOnBench();
    const code = runSecrets(host, outsideProgram);
    return { code, said: host.said() };
  }

  it(
    'should pass a tree and a history with no secret',
    () => {
      bench.repository.write('a.ts', 'export const a = 1;\n');
      bench.repository.commit();

      expect(secrets().code).toBe(0);
    },
    WITH_DOWNLOAD,
  );

  it('should find a token in a file that is not committed yet', () => {
    bench.repository.write('a.ts', 'export const a = 1;\n');
    bench.repository.commit();
    bench.repository.write('docs/notes.md', `token: ${TOKEN}\n`);

    const run = secrets();

    expect(run.said).toContain('github-pat');
    expect(run.said).toContain('docs/notes.md');
    expect(run.code).toBe(1);
  });

  it('should never print the secret it found', () => {
    bench.repository.write('docs/notes.md', `token: ${TOKEN}\n`);
    bench.repository.commit();

    const run = secrets();

    expect(run.code).toBe(1);
    expect(run.said).toContain('REDACTED');
    expect(run.said).not.toContain(TOKEN);
  });

  it('should find a token that was committed and then removed', () => {
    bench.repository.write('docs/notes.md', `token: ${TOKEN}\n`);
    const commit = bench.repository.commit();
    bench.repository.remove('docs/notes.md');
    bench.repository.write('a.ts', 'export const a = 1;\n');
    bench.repository.commit();

    const run = secrets();

    expect(run.said).toContain(commit);
    expect(run.code).toBe(1);
  });

  it('should not read a file git ignores', () => {
    bench.repository.write('.gitignore', '.env\n');
    bench.repository.write('.env', `TOKEN=${TOKEN}\n`);
    bench.repository.commit();

    expect(secrets().code).toBe(0);
  });

  it('should take no comment for a reason to pass a secret', () => {
    bench.repository.write('a.ts', 'export const a = 1;\n');
    bench.repository.commit();
    bench.repository.write('notes.md', `token: ${TOKEN} # gitleaks:allow\n`);

    expect(secrets().code).toBe(1);
  });

  it('should take no rules and no list from the tree it searches', () => {
    bench.repository.write('a.ts', 'export const a = 1;\n');
    bench.repository.commit();
    bench.repository.write('.gitleaks.toml', '[allowlist]\npaths = [".*"]\n');
    bench.repository.write('.gitleaksignore', 'notes.md:github-pat:1\n');
    bench.repository.write('notes.md', `token: ${TOKEN}\n`);

    expect(secrets().code).toBe(1);
  });
});

const RIGHT = `name: ci

on:
  push:
    branches: [main]

permissions: {}

concurrency:
  group: ci-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  check:
    name: check
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    permissions:
      contents: read # the code that is checked
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - run: echo done
`;

describe('the check of workflows, with real actionlint and zizmor', () => {
  /** Judges a tree whose one workflow is this text. */
  function workflows(text: string, name = 'ci.yml'): Heard & { code: number } {
    bench.repository.write(`.github/workflows/${name}`, text);
    const host = hostOnBench();
    return { ...host, code: runWorkflows(host, outsideProgram) };
  }

  /** The right workflow with one part of it replaced. */
  function wrong(part: string, by: string): string {
    expect(RIGHT).toContain(part);
    return RIGHT.replace(part, by);
  }

  it(
    'should pass a workflow that is pinned and asks for little',
    () => {
      const run = workflows(RIGHT);

      expect(run.said()).toContain('No findings to report');
      expect(run.code).toBe(0);
    },
    WITH_DOWNLOAD,
  );

  it.each([
    {
      name: 'an action named by its tag',
      part: 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1',
      by: 'actions/checkout@v7',
      finding: 'unpinned-uses',
    },
    {
      name: 'a token that may write everything',
      part: 'permissions: {}',
      by: 'permissions: write-all',
      finding: 'excessive-permissions',
    },
    {
      name: 'a permission with no word on why',
      part: 'contents: read # the code that is checked',
      by: 'contents: read # the code that is checked\n      issues: read',
      finding: 'undocumented-permissions',
    },
    {
      name: 'a credential left in the checkout',
      part: '        with:\n          persist-credentials: false\n',
      by: '',
      finding: 'artipacked',
    },
    {
      name: 'a value of the event written into a script',
      part: 'run: echo done',
      by: 'run: echo "${{ github.event.head_commit.message }}"',
      finding: 'template-injection',
    },
    {
      name: 'the event that carries a wider token',
      part: '  push:\n    branches: [main]\n',
      by: '  pull_request_target:\n',
      finding: 'dangerous-triggers',
    },
    {
      name: 'a job with no machine',
      part: '    runs-on: ubuntu-24.04\n',
      by: '',
      finding: '"runs-on" section is missing',
    },
    {
      name: 'a key no workflow has',
      part: 'timeout-minutes: 10',
      by: 'time-out: 10',
      finding: 'unexpected key "time-out"',
    },
  ])('should refuse $name', ({ part, by, finding }) => {
    const run = workflows(wrong(part, by));

    expect(run.said()).toContain(finding);
    expect(run.code).toBe(1);
  });

  it('should accept the wider event in the check of frozen files only', () => {
    const text = wrong(
      '  push:\n    branches: [main]\n',
      '  pull_request_target:\n',
    );

    expect(workflows(text, 'frozen.yml').code).toBe(0);
  });
});
