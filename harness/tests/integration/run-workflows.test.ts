import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { runWorkflows } from '#harness/gate/run-workflows';
import { HARNESS_ROOT } from '#harness/shared/policy';
import { useBench } from '#harness/tests/support/bench';
import { fakeHost, type Run } from '#harness/tests/support/fake-host';

const bench = useBench();

const CONFIGS = join(HARNESS_ROOT, 'configs');
const USUAL = 'on: push\n';

describe('runWorkflows', () => {
  const programOf = (name: string): string => `/tools/${name}`;
  const inTree = (path: string): string => join(bench.repository.root, path);

  function hostWhere(runs: (run: Run) => boolean): ReturnType<typeof fakeHost> {
    return fakeHost({ root: bench.repository.root, runs });
  }

  it('should lint each workflow, with nothing a machine may lack', () => {
    bench.repository.write('.github/workflows/ci.yml', USUAL);
    bench.repository.write('.github/workflows/b.yaml', USUAL);
    const host = hostWhere(() => true);

    expect(runWorkflows(host, programOf)).toBe(0);
    expect(host.ran[0]).toEqual({
      program: '/tools/actionlint',
      arguments: [
        '-shellcheck=',
        '-pyflakes=',
        '-no-color',
        '-config-file',
        join(CONFIGS, 'actionlint.yaml'),
        inTree('.github/workflows/b.yaml'),
        inTree('.github/workflows/ci.yml'),
      ],
    });
  });

  it('should audit the folder at the strictest level, offline', () => {
    bench.repository.write('.github/workflows/ci.yml', USUAL);
    const host = hostWhere(() => true);

    runWorkflows(host, programOf);

    expect(host.ran[1]).toEqual({
      program: '/tools/zizmor',
      arguments: [
        '--offline',
        '--no-progress',
        '--color',
        'never',
        '--pedantic',
        '--strict-collection',
        '--config',
        join(CONFIGS, 'zizmor.yml'),
        inTree('.github'),
      ],
    });
  });

  it('should take for a workflow only a file of the folder of workflows', () => {
    bench.repository.write('.github/workflows/ci.yml', USUAL);
    bench.repository.write('.github/workflows/notes.md', 'a\n');
    bench.repository.write('.github/workflows/deep/a.yml', USUAL);
    bench.repository.write('.github/dependabot.yml', 'version: 2\n');
    bench.repository.write('docs/.github/workflows/a.yml', USUAL);
    bench.repository.write('.github/workflows/a.yml.txt', USUAL);
    const host = hostWhere(() => true);

    runWorkflows(host, programOf);

    expect(host.ran[0]?.arguments.slice(5)).toEqual([
      inTree('.github/workflows/ci.yml'),
    ]);
  });

  it('should leave out a workflow that was removed and not committed', () => {
    bench.repository.write('.github/workflows/ci.yml', USUAL);
    bench.repository.write('.github/workflows/gone.yml', USUAL);
    bench.repository.commit();
    bench.repository.remove('.github/workflows/gone.yml');
    const host = hostWhere(() => true);

    runWorkflows(host, programOf);

    expect(host.ran[0]?.arguments.slice(5)).toEqual([
      inTree('.github/workflows/ci.yml'),
    ]);
  });

  it.each(['/tools/actionlint', '/tools/zizmor'])(
    'should fail when %s does, and run both',
    (red) => {
      bench.repository.write('.github/workflows/ci.yml', USUAL);
      const host = hostWhere((run) => run.program !== red);

      expect(runWorkflows(host, programOf)).toBe(1);
      expect(host.ran).toHaveLength(2);
    },
  );

  it('should refuse a tree with no workflow, and run nothing', () => {
    bench.repository.write('.github/dependabot.yml', 'version: 2\n');
    const host = hostWhere(() => true);

    expect(runWorkflows(host, programOf)).toBe(1);
    expect(host.ran).toEqual([]);
    expect(host.printed).toEqual([
      'workflows: the tree has no workflow to judge.',
    ]);
  });
});
