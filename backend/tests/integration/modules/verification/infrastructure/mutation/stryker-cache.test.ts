import { realpathSync } from 'node:fs';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { completed, MutationBench } from '#tests/support/mutation-bench';
import {
  APPLY,
  baselineReport,
  OLD_TESTS,
  reportOf,
} from '#tests/support/mutation-reports';
import { CACHE, exitedWith, REPORT } from '#tests/support/mutation-stand-ins';
import { parseStrykerReport } from '#verification/infrastructure/mutation/stryker-report-reading';

const ESCAPE = String.fromCharCode(0x1b);
const RED = `${ESCAPE}[31m`;
const RESET = `${ESCAPE}[39m`;

let bench: MutationBench;
let real: string;

/** A reason as a test runner prints it: colours, paths and a long trace. */
function traceIn(root: string): string {
  const frames = Array.from(
    { length: 200 },
    (_, line) => `    at discount (${root}/src/price.ts:${String(line)}:9)`,
  );
  return [`${RED}Expected 90 to be 80${RESET}`, ...frames].join('\n');
}

/** The report of the baseline, with what a test runner can plant in it. */
function plantedReport(): string {
  return reportOf({
    projectRoot: bench.root,
    tests: { [OLD_TESTS]: [['0', `${APPLY} in ${real}/tests`]] },
    mutants: [
      {
        id: '1',
        mutatorName: 'BlockStatement',
        replacement: '{}',
        at: '1:63-6:2',
        status: 'Killed',
        killedBy: ['0'],
        coveredBy: ['0'],
        statusReason: traceIn(bench.root),
      },
      {
        id: '2',
        mutatorName: 'ConditionalExpression',
        replacement: 'true',
        at: '2:7-2:15',
        status: 'Timeout',
        statusReason: `Timed out in ${real}/src/price.ts`,
      },
    ],
  });
}

async function storedCache(): Promise<string> {
  const result = completed(await bench.measureBaseline());
  return (await bench.artifacts.read(result.cacheReference ?? '')) ?? '';
}

beforeEach(() => {
  bench = new MutationBench();
  real = realpathSync(bench.root);
  const report = plantedReport();
  bench.tool.writes({ [REPORT]: report, [CACHE]: report });
});

afterEach(() => {
  bench.remove();
});

describe('StrykerMutationRunner', () => {
  describe('when the tool wrote paths of the host and codes of a terminal', () => {
    it('should store a cache with neither', async () => {
      const cache = await storedCache();

      expect(cache).not.toContain(bench.root);
      expect(cache).not.toContain(real);
      expect(cache).not.toContain(ESCAPE);
      expect(cache).not.toContain('\\u001b');
      expect(cache).toContain('Expected 90 to be 80');
      expect(cache).toContain('at discount (./src/price.ts:0:9)');
      expect(cache).toContain('Timed out in ./src/price.ts');
    });

    it('should cut a long reason short', async () => {
      const cache = JSON.parse(await storedCache()) as {
        files: Record<string, { mutants: { statusReason: string }[] }>;
      };

      const reasons = (cache.files['src/price.ts']?.mutants ?? []).map(
        ({ statusReason }) => statusReason,
      );
      expect(reasons[0]).toHaveLength(1001);
      expect(reasons[0]?.endsWith('…')).toBe(true);
      expect(reasons[1]).toBe('Timed out in ./src/price.ts');
    });

    it('should leave out the root, the configuration and the facts of the tool', async () => {
      const cache = JSON.parse(await storedCache()) as object;

      expect(Object.keys(cache)).toEqual([
        'schemaVersion',
        'thresholds',
        'files',
        'testFiles',
      ]);
    });

    it('should keep what the incremental mode reads, as a report', async () => {
      const cache = await storedCache();
      const kept = parseStrykerReport(cache);

      expect(kept.outcome).toBe('read');
      expect(JSON.parse(cache)).toMatchObject({
        files: {
          'src/price.ts': {
            source: expect.stringContaining('return price') as unknown,
            mutants: [
              { id: '1', status: 'Killed', killedBy: ['0'], static: false },
              { id: '2', status: 'Timeout' },
            ],
          },
        },
        testFiles: {
          [OLD_TESTS]: {
            source: expect.any(String) as unknown,
            tests: [{ id: '0', name: `${APPLY} in ./tests` }],
          },
        },
      });
    });

    it('should name a test without them in the result', async () => {
      const { mutants } = completed(await bench.measureBaseline());

      expect(mutants[0]?.killedBy.map(({ name }) => name)).toEqual([
        `${APPLY} in ./tests`,
      ]);
    });

    it('should store the output of the tool with neither', async () => {
      bench.tool.sandbox.answer(
        exitedWith(0, ''),
        exitedWith(0, `${RED}ERROR${RESET} ${bench.root}/a and ${real}/b\n`),
      );

      const result = completed(await bench.measureBaseline());

      await expect(
        bench.artifacts.read(result.outputReference ?? ''),
      ).resolves.toBe('ERROR ./a and ./b\n');
    });
  });

  describe('when a mutant has no reason', () => {
    it('should store it with none', async () => {
      const report = baselineReport(bench.root);
      bench.tool.writes({ [REPORT]: report, [CACHE]: report });

      const cache = JSON.parse(await storedCache()) as {
        files: Record<string, { mutants: object[] }>;
      };

      const [first] = cache.files['src/price.ts']?.mutants ?? [];
      expect(first).toMatchObject({ id: '6', status: 'Killed' });
      expect(first).not.toHaveProperty('statusReason');
    });
  });

  describe('when the cache lists no test file', () => {
    it('should store it with an empty list of them', async () => {
      const cache = JSON.parse(baselineReport(bench.root)) as {
        testFiles?: object;
      };
      delete cache.testFiles;
      bench.tool.writes({
        [REPORT]: baselineReport(bench.root),
        [CACHE]: JSON.stringify(cache),
      });

      const stored = JSON.parse(await storedCache()) as object;

      expect(stored).toHaveProperty('testFiles', {});
      expect(parseStrykerReport(JSON.stringify(stored)).outcome).toBe('read');
    });
  });
});
