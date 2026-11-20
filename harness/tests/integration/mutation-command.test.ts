import { beforeEach, describe, expect, it } from 'vitest';

import { runMutation } from '#harness/gate/run-mutation';
import { useBench } from '#harness/tests/support/bench';
import { type FakeHost, fakeHost } from '#harness/tests/support/fake-host';

const bench = useBench();

describe('runMutation', () => {
  const REPORT = 'reports/mutation/harness.json';
  const SOURCE = 'harness/gate/steps.ts';
  const RESOURCES =
    'mutation: harness runs with 4 test runner(s), ' +
    '640 MB of heap each, a time limit of 15000 ms';

  function report(statuses: Record<string, string[]>): string {
    const files: Record<string, object> = {};
    for (const [file, list] of Object.entries(statuses)) {
      files[file] = { mutants: list.map((status) => ({ status })) };
    }
    return JSON.stringify({ files });
  }

  /** A host whose engine finishes and leaves this report behind. */
  function hostWriting(text: string): FakeHost {
    return fakeHost({
      root: bench.repository.root,
      passes: () => {
        bench.repository.write(REPORT, text);
        return true;
      },
    });
  }

  beforeEach(() => {
    bench.repository.write(SOURCE, 'export const steps = 1;\n');
    bench.repository.write(
      'harness/gate/step.ts',
      'export interface Step {}\n',
    );
    bench.repository.write('harness/bin/check.ts', 'export const bin = 1;\n');
    bench.repository.write(
      'harness/tests/unit/a.test.ts',
      'export const a = 1;\n',
    );
  });

  it('should start the engine by its path, with its configuration', () => {
    const engine = hostWriting(report({ [SOURCE]: ['Killed'] }));

    runMutation(engine);

    expect(engine.started).toEqual([
      {
        nodeOptions: [],
        script: 'node_modules/@stryker-mutator/core/bin/stryker.js',
        arguments: [
          'run',
          'harness/configs/stryker.json',
          '--concurrency',
          '4',
          '--testRunnerNodeArgs=--max-old-space-size=640',
          '--timeoutMS',
          '15000',
        ],
      },
    ]);
  });

  it('should fail a rate below the floor of the policy', () => {
    const engine = hostWriting(report({ [SOURCE]: ['Killed', 'Timeout'] }));

    expect(runMutation(engine)).toBe(1);
    expect(engine.printed).toEqual([
      RESOURCES,
      'mutation: harness failed: 50.00%: 1 killed, 0 survived, ' +
        '0 not covered, 1 timed out, below the floor of 88%',
    ]);
  });

  it('should pass a rate at the floor of the policy or above it', () => {
    const engine = hostWriting(report({ [SOURCE]: ['Killed', 'Killed'] }));

    expect(runMutation(engine)).toBe(0);
    expect(engine.printed).toEqual([
      RESOURCES,
      'mutation: harness passed: 100.00%: 2 killed, 0 survived, ' +
        '0 not covered, 0 timed out, at or above the floor of 88%',
    ]);
  });

  it('should fail a full run that found nothing where a floor is set', () => {
    const engine = hostWriting(report({ [SOURCE]: [] }));

    expect(runMutation(engine)).toBe(1);
    expect(engine.printed).toEqual([
      RESOURCES,
      'mutation: harness failed: not_applicable, and it has a floor: ' +
        'mutants were expected',
    ]);
  });

  it('should not measure when a source file is not in the report', () => {
    bench.repository.write('harness/gate/left-out.ts', 'export const a = 1;\n');
    const engine = hostWriting(report({ [SOURCE]: ['Killed'] }));

    expect(runMutation(engine)).toBe(1);
    expect(engine.printed.at(-1)).toContain(
      'not measured. 1 file(s) of the area are not in the report, ' +
        'such as harness/gate/left-out.ts.',
    );
  });

  it('should not measure when the engine did not finish', () => {
    const stopped = fakeHost({
      root: bench.repository.root,
      passes: () => false,
    });

    expect(runMutation(stopped)).toBe(1);
    expect(stopped.printed).toEqual([
      RESOURCES,
      'mutation: harness failed: not measured. ' +
        'The run of the engine did not finish.',
    ]);
  });

  it('should not trust a report that an earlier run left behind', () => {
    bench.repository.write(REPORT, report({ [SOURCE]: ['Killed'] }));

    expect(runMutation(bench.host)).toBe(1);
    expect(bench.host.printed.at(-1)).toContain(`${REPORT} was not written.`);
  });

  it.each([
    ['text that is not JSON', '{"files":', 'is not JSON.'],
    ['a list', '[]', 'must hold a JSON object.'],
    ['no files', '{}', 'The report has no "files".'],
  ])('should not measure a report that holds %s', (_, text, reason) => {
    const engine = hostWriting(text);

    expect(runMutation(engine)).toBe(1);
    expect(engine.printed.at(-1)).toContain(`not measured. `);
    expect(engine.printed.at(-1)).toContain(reason);
  });

  it('should start fewer test runners on a machine with little memory', () => {
    const small = fakeHost({
      root: bench.repository.root,
      settings: { HARNESS_MUTATION_MEMORY_MB: '1280' },
      passes: () => {
        bench.repository.write(REPORT, report({ [SOURCE]: ['Killed'] }));
        return true;
      },
    });

    runMutation(small);

    expect(small.started[0]?.arguments).toContain('1');
    expect(small.printed[0]).toContain('1 test runner(s), 512 MB of heap');
  });

  it('should not start the engine with a setting it cannot read', () => {
    const wrong = fakeHost({
      root: bench.repository.root,
      settings: { HARNESS_MUTATION_WORKERS: 'many' },
    });

    expect(runMutation(wrong)).toBe(1);
    expect(wrong.started).toEqual([]);
    expect(wrong.printed).toEqual([
      'mutation: harness failed: not measured. HARNESS_MUTATION_WORKERS ' +
        'must be a whole number above zero, and it is "many".',
    ]);
  });

  it('should not measure a mutant that was switched off', () => {
    const engine = hostWriting(report({ [SOURCE]: ['Killed', 'Ignored'] }));

    expect(runMutation(engine)).toBe(1);
    expect(engine.printed.at(-1)).toContain('A mutant has the status Ignored.');
  });
});
