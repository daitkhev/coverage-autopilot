import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FilePath } from '#kernel/primitives/file-path';
import { completed, MutationBench } from '#tests/support/mutation-bench';
import { baselineReport, listingReport } from '#tests/support/mutation-reports';
import { CONFIG, REPORT } from '#tests/support/mutation-stand-ins';
import type { MutationRunRequest } from '#verification/application/ports/mutation-runner.port';

let bench: MutationBench;

/** A baseline whose every test file failed before, so all are left out. */
function leftWithNoTest(): MutationRunRequest {
  return {
    ...bench.request('jest'),
    leftOutTestFiles: [FilePath.create('tests/price.test.ts')],
  };
}

beforeEach(() => {
  bench = new MutationBench();
});

afterEach(() => {
  bench.remove();
});

describe('StrykerMutationRunner, when test files are left out', () => {
  it('should keep them out of the sandbox of the tool', async () => {
    await bench.measureBaseline(leftWithNoTest());

    expect(JSON.parse(bench.tool.found[CONFIG] ?? '')).toMatchObject({
      ignorePatterns: ['/.yarn/cache', '/tests/price.test.ts'],
      allowEmpty: true,
    });
  });

  describe('when they held every test, and the tool ended with no report', () => {
    beforeEach(() => {
      bench.tool.writesInTurn({}, { [REPORT]: listingReport(bench.root) });
    });

    it('should list the mutants with a command that passes in place of the runner', async () => {
      await bench.measureBaseline(leftWithNoTest());

      const [, listing] = bench.tool.foundInTurn;
      expect(bench.tool.sandbox.requests).toHaveLength(3);
      expect(JSON.parse(listing?.[CONFIG] ?? '')).toMatchObject({
        testRunner: 'command',
        commandRunner: { command: 'exit 0' },
        ignorePatterns: ['/.yarn/cache', '/tests/price.test.ts'],
      });
    });

    it('should answer every mutant as covered by no test, under the runner of the request', async () => {
      const result = completed(await bench.measureBaseline(leftWithNoTest()));

      expect(result.tool.testRunner).toBe('jest');
      expect(new Set(result.mutants.map(({ status }) => status))).toEqual(
        new Set(['no_coverage']),
      );
      expect(
        result.mutants.every(
          ({ coveredBy, killedBy }) =>
            coveredBy.length === 0 && killedBy.length === 0,
        ),
      ).toBe(true);
      expect(result.cacheReference).toBeNull();
    });

    it('should name the same set of mutants as a run with tests', async () => {
      const listed = completed(await bench.measureBaseline(leftWithNoTest()));
      bench.tool.writes({ [REPORT]: baselineReport(bench.root) });
      const measured = completed(await bench.measureBaseline());

      expect(listed.mutantSetHash).toBe(measured.mutantSetHash);
      expect(listed.mutants).toHaveLength(measured.mutants.length);
    });
  });
});
