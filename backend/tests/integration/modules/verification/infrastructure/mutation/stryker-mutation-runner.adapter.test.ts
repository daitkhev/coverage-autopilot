import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FilePath } from '#kernel/primitives/file-path';
import { ARTIFACT_STORE } from '#ports/artifact-store.port';
import { SANDBOX } from '#ports/sandbox.port';
import {
  completed,
  MutationBench,
  OWNER,
  RUN_TIMEOUT_MS,
} from '#tests/support/mutation-bench';
import {
  APPLY,
  baselineReport,
  MESSAGE,
  NEW_TESTS,
  NO_RATE,
  OLD_TESTS,
  patchedReport,
  REFUSE,
} from '#tests/support/mutation-reports';
import {
  CACHE,
  CONFIG,
  FOLDER,
  MUTATION_TEST_SETTINGS,
  REPORT,
} from '#tests/support/mutation-stand-ins';
import {
  type MutantResult,
  MUTATION_RUNNER,
  type MutationRunner,
} from '#verification/application/ports/mutation-runner.port';
import { MUTATION_SETTINGS } from '#verification/infrastructure/mutation/mutation-settings';
import { StrykerMutationRunner } from '#verification/infrastructure/mutation/stryker-mutation-runner.adapter';

const ENVIRONMENT = MUTATION_TEST_SETTINGS.commandEnvironment;

const TOOL = 'node_modules/.cache/coverage-autopilot/mutation';

let bench: MutationBench;

function placeOf(mutant: MutantResult): string {
  const { startLine, startColumn, endLine, endColumn } = mutant;
  return `${String(startLine)}:${String(startColumn)}-${String(endLine)}:${String(endColumn)}`;
}

function mutantAt(
  mutants: readonly MutantResult[],
  place: string,
  replacement: string,
): MutantResult | undefined {
  return mutants.find(
    (mutant) => placeOf(mutant) === place && mutant.replacement === replacement,
  );
}

function testOf(file: string, name: string): object {
  return { file: FilePath.create(file), name };
}

beforeEach(() => {
  bench = new MutationBench();
});

afterEach(() => {
  bench.remove();
});

describe('StrykerMutationRunner', () => {
  describe('measureBaseline', () => {
    it.each(['jest', 'vitest'] as const)(
      'should install the tool and its %s runner in a folder of its own, with the network open',
      async (testRunner) => {
        await bench.measureBaseline(bench.request(testRunner));

        expect(bench.tool.sandbox.requests[0]).toEqual({
          workingCopyPath: bench.root,
          command: [
            'npm',
            'install',
            ...['--prefix', TOOL],
            '--no-save',
            '--no-package-lock',
            '--ignore-scripts',
            '--legacy-peer-deps',
            '--no-audit',
            '--no-fund',
            ...['--cache', `${TOOL}/cache`],
            '@stryker-mutator/core@10.1.1',
            `@stryker-mutator/${testRunner}-runner@10.1.1`,
          ],
          environment: ENVIRONMENT,
          network: 'open',
          timeoutMs: MUTATION_TEST_SETTINGS.installTimeoutMs,
        });
      },
    );

    it('should run the tool by its path, with no network, for the time of the request', async () => {
      await bench.measureBaseline();

      expect(bench.tool.sandbox.requests).toHaveLength(2);
      expect(bench.tool.sandbox.requests[1]).toEqual({
        workingCopyPath: bench.root,
        command: [
          'node',
          `${TOOL}/node_modules/@stryker-mutator/core/bin/stryker.js`,
          'run',
          CONFIG,
        ],
        environment: {
          ...ENVIRONMENT,
          NODE_PATH: `${bench.root}/node_modules/.pnpm/node_modules`,
        },
        network: 'none',
        timeoutMs: RUN_TIMEOUT_MS,
      });
    });

    it('should never open the network or install by itself', async () => {
      await bench.runner.measureBaseline(
        bench.request(),
        new AbortController().signal,
      );
      await bench.runner.measureWithPatch(
        { ...bench.request(), baselineCacheReference: null },
        new AbortController().signal,
      );

      expect(
        bench.tool.sandbox.requests.map(({ command, network }) => [
          command[0],
          network,
        ]),
      ).toEqual([
        ['node', 'none'],
        ['node', 'none'],
      ]);
    });

    it('should open the network for the install alone', async () => {
      await bench.measureBaseline();

      const networks = bench.tool.sandbox.requests.map(
        ({ network }) => network,
      );
      expect(networks).toEqual(['open', 'none']);
    });

    it('should write a configuration of its own and start cold', async () => {
      await bench.measureBaseline(bench.request('jest'));

      expect(Object.keys(bench.tool.found)).toEqual([CONFIG]);
      expect(JSON.parse(bench.tool.found[CONFIG] ?? '')).toEqual({
        testRunner: 'jest',
        jest: { enableFindRelatedTests: false },
        mutate: ['./src/price.ts'],
        coverageAnalysis: 'perTest',
        disableBail: true,
        concurrency: 2,
        timeoutFactor: 1.5,
        timeoutMS: 5000,
        reporters: ['json'],
        jsonReporter: { fileName: REPORT },
        incremental: true,
        incrementalFile: CACHE,
        tempDirName: FOLDER,
        allowConsoleColors: false,
      });
    });

    it('should have every test run, also for a target no test imports', async () => {
      await bench.measureBaseline(bench.request('vitest'));

      expect(JSON.parse(bench.tool.found[CONFIG] ?? '')).toMatchObject({
        testRunner: 'vitest',
        vitest: { related: false },
      });
    });

    it('should answer the mutants of the target by position, without the ignored one', async () => {
      const result = completed(await bench.measureBaseline());

      expect(
        result.mutants.map((mutant) => [
          placeOf(mutant),
          mutant.mutator,
          mutant.replacement,
          mutant.status,
        ]),
      ).toEqual([
        ['1:63-6:2', 'BlockStatement', '{}', 'killed'],
        ['2:7-2:15', 'ConditionalExpression', 'false', 'survived'],
        ['2:7-2:15', 'ConditionalExpression', 'true', 'killed'],
        ['2:7-2:15', 'EqualityOperator', 'rate >= 1', 'survived'],
        ['2:17-4:4', 'BlockStatement', '{}', 'error'],
        ['3:26-3:42', 'StringLiteral', '""', 'no_coverage'],
        ['5:10-5:30', 'ArithmeticOperator', 'price + price * rate', 'killed'],
        ['5:10-5:30', 'ArithmeticOperator', 'price - price / rate', 'error'],
        ['5:18-5:30', 'ArithmeticOperator', 'price / rate', 'timeout'],
      ]);
      expect(result.mutants.map(({ file }) => file.value)).toEqual(
        Array.from({ length: 9 }, () => 'src/price.ts'),
      );
      expect(result.tool).toEqual({
        name: 'StrykerJS',
        version: '10.1.1',
        testRunner: 'vitest',
      });
    });

    it('should name the tests that ran and killed a mutant by file and name', async () => {
      const { mutants } = completed(await bench.measureBaseline());

      expect(mutantAt(mutants, '1:63-6:2', '{}')).toMatchObject({
        killedBy: [testOf(OLD_TESTS, APPLY), testOf(OLD_TESTS, NO_RATE)],
        coveredBy: [testOf(OLD_TESTS, APPLY), testOf(OLD_TESTS, NO_RATE)],
      });
      expect(mutantAt(mutants, '5:18-5:30', 'price / rate')).toMatchObject({
        killedBy: [],
        coveredBy: [testOf(OLD_TESTS, APPLY)],
      });
      expect(mutantAt(mutants, '3:26-3:42', '""')).toMatchObject({
        killedBy: [],
        coveredBy: [],
      });
    });

    it('should keep the output and the cache, and answer their references', async () => {
      const result = completed(await bench.measureBaseline());

      expect(
        bench.artifacts.saved.map(({ owner, label }) => [owner, label]),
      ).toEqual([
        [OWNER, 'mutation-run'],
        [OWNER, 'mutation-cache'],
      ]);
      expect(result.outputReference).toBe('artifact-1');
      expect(result.cacheReference).toBe('artifact-2');
    });

    describe('when the tool wrote no cache', () => {
      it('should answer no reference of a cache', async () => {
        bench.tool.writes({ [REPORT]: baselineReport(bench.root) });

        const result = completed(await bench.measureBaseline());

        expect(result.cacheReference).toBeNull();
        expect(bench.artifacts.saved).toHaveLength(1);
      });
    });
  });

  describe('measureWithPatch', () => {
    beforeEach(() => {
      const report = patchedReport(bench.root);
      bench.tool.writes({ [REPORT]: report, [CACHE]: report });
    });

    it('should start from the cache of the baseline where the tool looks for it', async () => {
      const cache = baselineReport('/work/baseline-copy');
      const reference = await bench.artifacts.save({
        owner: OWNER,
        label: 'mutation-cache',
        content: cache,
      });

      await bench.measureWithPatch(reference);

      expect(bench.tool.found).toEqual({
        [CONFIG]: expect.any(String) as unknown,
        [CACHE]: cache,
      });
    });

    it.each([
      ['no cache was given', null],
      ['the store lost the cache', 'artifact-404'],
    ])('should start cold when %s', async (_, reference) => {
      await bench.measureWithPatch(reference);

      expect(Object.keys(bench.tool.found)).toEqual([CONFIG]);
    });

    it('should start cold when the stored cache is not a report', async () => {
      const reference = await bench.artifacts.save({
        owner: OWNER,
        label: 'mutation-cache',
        content: '{ "files": {} }',
      });

      await bench.measureWithPatch(reference);

      expect(Object.keys(bench.tool.found)).toEqual([CONFIG]);
    });

    it('should resolve the renumbered ids of the tests through its own report', async () => {
      const { mutants } = completed(await bench.measureWithPatch(null));

      expect(mutantAt(mutants, '2:7-2:15', 'false')).toMatchObject({
        status: 'killed',
        killedBy: [testOf(NEW_TESTS, REFUSE), testOf(NEW_TESTS, MESSAGE)],
      });
      expect(mutantAt(mutants, '1:63-6:2', '{}')).toMatchObject({
        killedBy: [testOf(OLD_TESTS, APPLY), testOf(OLD_TESTS, NO_RATE)],
      });
    });

    it('should name the set of mutants as the baseline did', async () => {
      bench.tool.writes({ [REPORT]: baselineReport(bench.root) });
      const baseline = completed(await bench.measureBaseline());
      bench.tool.writes({ [REPORT]: patchedReport(bench.root) });

      const patched = completed(await bench.measureWithPatch(null));

      expect(patched.mutants).not.toEqual(baseline.mutants);
      expect(patched.mutantSetHash).toBe(baseline.mutantSetHash);
    });
  });

  describe('when it is injected by its token', () => {
    it('should run the tool in the sandbox and keep its output in the store', async () => {
      const module = await Test.createTestingModule({
        providers: [
          { provide: MUTATION_RUNNER, useClass: StrykerMutationRunner },
          { provide: SANDBOX, useValue: bench.tool.sandbox },
          { provide: ARTIFACT_STORE, useValue: bench.artifacts },
          { provide: MUTATION_SETTINGS, useValue: MUTATION_TEST_SETTINGS },
        ],
      }).compile();
      const runner = module.get<MutationRunner>(MUTATION_RUNNER);

      const signal = new AbortController().signal;

      const installed = await runner.installTool(bench.request(), signal);
      const result = await runner.measureBaseline(bench.request(), signal);

      expect(runner).toBeInstanceOf(StrykerMutationRunner);
      expect(installed).toEqual({ outcome: 'installed' });
      expect(result.outcome).toBe('completed');
      expect(bench.tool.sandbox.requests).toHaveLength(2);
    });
  });
});
