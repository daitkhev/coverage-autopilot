import {
  existsSync,
  lstatSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MutationBench } from '#tests/support/mutation-bench';
import { baselineReport } from '#tests/support/mutation-reports';
import {
  CACHE,
  exitedWith,
  FOLDER,
  REPORT,
  timedOut,
} from '#tests/support/mutation-stand-ins';
import {
  createProjectFolder,
  type ProjectFolder,
} from '#tests/support/project-folder';
import { PASSED } from '#tests/support/recording-sandbox';
import { UnreadableMutationReportError } from '#verification/infrastructure/errors/unreadable-mutation-report.error';

let bench: MutationBench;
let outside: ProjectFolder;

/**
 * A run of the tool that writes the report and the cache, and leaves a
 * link to a file outside the copy in the place of one of them.
 */
function linkInsteadOf(file: string): void {
  bench.tool.sandbox.onRun((request) => {
    if (request.command[0] !== 'node') {
      return;
    }
    for (const each of [REPORT, CACHE]) {
      const path = join(bench.root, each);
      if (each === file) {
        symlinkSync(join(outside.root, 'report.json'), path);
      } else {
        writeFileSync(path, baselineReport(bench.root));
      }
    }
  });
}

beforeEach(() => {
  bench = new MutationBench();
  outside = createProjectFolder({ 'report.json': baselineReport('/x') });
});

afterEach(() => {
  bench.remove();
  outside.remove();
});

describe('StrykerMutationRunner', () => {
  describe('when the install fails', () => {
    it('should answer unsupported with the error of npm and run nothing else', async () => {
      bench.tool.sandbox.answer(
        exitedWith(
          1,
          'npm warn config production Use `--omit=dev` instead.\n' +
            'npm error code ETARGET\n' +
            'npm error notarget No matching version found.\n',
        ),
      );

      await expect(bench.measureBaseline()).resolves.toEqual({
        outcome: 'unsupported',
        detail:
          'StrykerJS 10.1.1 and its vitest runner could not be installed: ' +
          'it exited with 1. npm error code ETARGET',
        outputReference: 'artifact-1',
      });
      expect(bench.tool.sandbox.requests).toHaveLength(1);
      expect(bench.artifacts.saved).toMatchObject([
        { owner: 'improvement:7', label: 'mutation-install' },
      ]);
    });

    it('should answer unsupported when the install runs out of its time', async () => {
      bench.tool.sandbox.answer(timedOut('npm http fetch GET 200 core\n'));

      await expect(bench.measureBaseline()).resolves.toMatchObject({
        outcome: 'unsupported',
        detail:
          'StrykerJS 10.1.1 and its vitest runner could not be installed: ' +
          'it ran out of its time limit. npm http fetch GET 200 core',
      });
    });
  });

  describe('when the tool stops before any mutant ran', () => {
    it('should answer unsupported with the first error it logged', async () => {
      bench.tool.writes({});
      bench.tool.sandbox.answer(
        PASSED,
        exitedWith(
          1,
          [
            '10:00:01 (42) INFO ProjectReader Found 1 of 12 file(s).',
            '10:00:04 (42) ERROR DryRunExecutor One or more tests failed:',
            `    at ${bench.root}/tests/price.test.ts:4:5`,
            '10:00:04 (42) ERROR Stryker There were failed tests.',
          ].join('\n'),
        ),
      );

      await expect(bench.measureBaseline()).resolves.toEqual({
        outcome: 'unsupported',
        detail:
          'StrykerJS stopped before any mutant ran: it exited with 1. ' +
          '10:00:04 (42) ERROR DryRunExecutor One or more tests failed:',
        outputReference: 'artifact-1',
      });
      expect(bench.artifacts.saved).toHaveLength(1);
    });

    it('should say so of a tool that ended with no code and said nothing', async () => {
      bench.tool.writes({});
      bench.tool.sandbox.answer(PASSED, exitedWith(null, ''));

      await expect(bench.measureBaseline()).resolves.toMatchObject({
        outcome: 'unsupported',
        detail:
          'StrykerJS stopped before any mutant ran: it exited with no code.',
      });
    });

    it('should never read a report an earlier run left', async () => {
      bench.folder.write(REPORT, baselineReport(bench.root));
      bench.tool.writes({});
      bench.tool.sandbox.answer(PASSED, exitedWith(1, 'ERROR Stryker failed'));

      await expect(bench.measureBaseline()).resolves.toMatchObject({
        outcome: 'unsupported',
      });
    });
  });

  describe('when code of the repository put a link in the place of the folder', () => {
    it('should remove the link and follow it nowhere', async () => {
      symlinkSync(outside.root, join(bench.root, FOLDER));

      await bench.measureBaseline();

      expect(lstatSync(join(bench.root, FOLDER)).isDirectory()).toBe(true);
      expect(readdirSync(outside.root)).toEqual(['report.json']);
    });
  });

  describe('when the tool ended well and wrote no report, not even to list the mutants', () => {
    it('should throw UnreadableMutationReportError', async () => {
      bench.tool.writes({});

      const run = bench.measureBaseline();

      await expect(run).rejects.toThrow(
        new UnreadableMutationReportError(
          'StrykerJS ended without a failure and wrote no ' +
            '.coverage-autopilot-mutation/report.json.',
        ),
      );
      await expect(run).rejects.toMatchObject({
        code: 'unreadable_mutation_report',
        retryable: false,
      });
    });
  });

  describe('when the run reaches the time of the request', () => {
    it('should keep the cache the tool saved and answer timed_out', async () => {
      bench.tool.writes({ [CACHE]: baselineReport(bench.root) });
      bench.tool.sandbox.answer(PASSED, timedOut('Mutation testing 40% done'));

      await expect(bench.measureBaseline()).resolves.toEqual({
        outcome: 'timed_out',
        cacheReference: 'artifact-2',
        outputReference: 'artifact-1',
      });
      expect(bench.artifacts.saved.map(({ label }) => label)).toEqual([
        'mutation-run',
        'mutation-cache',
      ]);
    });

    it.each([
      ['saved none', {}],
      ['was cut off while it saved one', { [CACHE]: '{ "schemaVersion": "1' }],
    ])('should keep no cache when the tool %s', async (_, written) => {
      bench.tool.writes(written);
      bench.tool.sandbox.answer(PASSED, timedOut(''));

      await expect(bench.measureBaseline()).resolves.toEqual({
        outcome: 'timed_out',
        cacheReference: null,
        outputReference: 'artifact-1',
      });
    });
  });

  describe.each([
    ['the report', REPORT],
    ['the cache', CACHE],
  ])('when %s is a link', (_, file) => {
    it('should throw UnreadableMutationReportError and read nothing', async () => {
      linkInsteadOf(file);

      await expect(bench.measureBaseline()).rejects.toThrow(
        new UnreadableMutationReportError(
          `${file} was not read: it is not a plain file.`,
        ),
      );
    });
  });

  describe('when the report is not a mutation report', () => {
    it.each([
      ['{ "files', 'it is not JSON'],
      [
        '{ "schemaVersion": "1.0", "files": {} }',
        'it is not a mutation report',
      ],
    ])(
      'should throw UnreadableMutationReportError for %s',
      async (text, words) => {
        bench.tool.writes({ [REPORT]: text });

        await expect(bench.measureBaseline()).rejects.toThrow(
          `.coverage-autopilot-mutation/report.json: ${words}`,
        );
      },
    );

    it('should say where without a path of the host', async () => {
      const report = JSON.parse(baselineReport(bench.root)) as {
        testFiles: Record<string, { tests: unknown }>;
      };
      report.testFiles[`${bench.root}/tests/a.test.ts`] = { tests: 'none' };
      bench.tool.writes({ [REPORT]: JSON.stringify(report) });

      const run = bench.measureBaseline();

      await expect(run).rejects.toThrow(UnreadableMutationReportError);
      await expect(run).rejects.toThrow('./tests/a.test.ts');
      await expect(run).rejects.not.toThrow(bench.root);
    });
  });

  describe('when the signal is aborted', () => {
    it('should throw its reason before it runs or writes anything', async () => {
      const controller = new AbortController();
      controller.abort(new Error('user_cancelled'));

      await expect(
        bench.runner.installTool(bench.request(), controller.signal),
      ).rejects.toThrow('user_cancelled');
      await expect(
        bench.runner.measureBaseline(bench.request(), controller.signal),
      ).rejects.toThrow('user_cancelled');
      expect(bench.tool.sandbox.requests).toEqual([]);
      expect(existsSync(join(bench.root, FOLDER))).toBe(false);
    });
  });
});
