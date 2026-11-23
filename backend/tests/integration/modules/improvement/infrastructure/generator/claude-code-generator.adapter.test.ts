import { rmSync, symlinkSync, utimesSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { UnknownPromptVersionError } from '#improvement/infrastructure/errors/unknown-prompt-version.error';
import { Instant } from '#kernel/time/instant';
import {
  type GeneratorBench,
  generatorBench,
} from '#tests/support/generator-bench';
import {
  CREDENTIAL_VALUE,
  GENERATOR_TEST_SETTINGS,
} from '#tests/support/generator-request';
import {
  answerEvent,
  exited,
  initEvent,
  rateLimitEvent,
  RESET_SECONDS,
  resultEvent,
  streamOf,
  unifiedWindows,
} from '#tests/support/generator-stream';

const SUCCEEDED = streamOf(
  initEvent(),
  answerEvent('I add a test of the discount.'),
  rateLimitEvent({
    status: 'allowed',
    rateLimitType: 'five_hour',
    resetsAt: RESET_SECONDS,
    unifiedWindows: unifiedWindows(0.25, 0.5),
  }),
  resultEvent(),
);

const NEW_TEST = { 'tests/price.test.ts': 'expect(price(2)).toBe(4);\n' };

const A_DAY_MS = 86_400_000;

let bench: GeneratorBench;

function commandRun(): readonly string[] {
  return bench.sandbox.requests[0]?.command ?? [];
}

beforeEach(() => {
  bench = generatorBench();
});

afterEach(() => {
  bench.folder.remove();
});

describe('ClaudeCodeGenerator', () => {
  describe('generate', () => {
    it('should start the CLI with the protected arguments and the prompt as one', async () => {
      bench.answer(exited(SUCCEEDED));

      await bench.generate();

      expect(commandRun().slice(0, -1)).toEqual([
        'claude',
        '--restricted',
        '--tools',
        'Read,Write,Edit,Glob,Grep',
        '--permission-mode',
        'acceptEdits',
        '--permission-prompts',
        'none',
        '--strict-mcp-config',
        '--settings',
        '{"disableAllHooks":true,"permissions":{"blockReadsOutsideWorkingDirectories":true}}',
        '--no-session-persistence',
        '--model',
        'claude-test-model',
        '--max-turns',
        '12',
        '--output-format',
        'stream-json',
        '--verbose',
        '-p',
      ]);
      expect(commandRun().at(-1)).toContain('Target file: src/price.ts');
    });

    it('should limit the cost only when the request has a limit of cost', async () => {
      bench.answer(exited(SUCCEEDED));

      await bench.generate({
        limits: { maxTurns: 3, maxCostUsd: 0.5, timeoutMs: 1000 },
      });

      expect(commandRun().slice(14, 20)).toEqual([
        '--max-turns',
        '3',
        '--max-budget-usd',
        '0.5',
        '--output-format',
        'stream-json',
      ]);
    });

    it('should give the CLI exactly its variables, the network and the time limit', async () => {
      bench.answer(exited(SUCCEEDED));

      await bench.generate();

      expect(bench.sandbox.requests[0]).toMatchObject({
        workingCopyPath: bench.folder.root,
        network: 'open',
        timeoutMs: 600_000,
      });
      expect(bench.sandbox.requests[0]?.environment).toEqual({
        PATH: '/usr/local/bin:/usr/bin:/bin',
        CLAUDE_CODE_OAUTH_TOKEN: CREDENTIAL_VALUE,
        HOME: '/tmp',
        CLAUDE_CONFIG_DIR: '/tmp/.claude',
        CLAUDE_CODE_DISABLE_CLAUDE_MDS: '1',
      });
    });

    it('should keep a variable the adapter sets from being replaced by the settings', async () => {
      bench.folder.remove();
      bench = generatorBench({
        ...GENERATOR_TEST_SETTINGS,
        environment: {
          HOME: '/home/owner',
          CLAUDE_CODE_DISABLE_CLAUDE_MDS: '0',
        },
      });
      bench.answer(exited(SUCCEEDED));

      await bench.generate();

      expect(bench.sandbox.requests[0]?.environment).toMatchObject({
        HOME: '/tmp',
        CLAUDE_CODE_DISABLE_CLAUDE_MDS: '1',
      });
    });

    it('should answer generated with the report when the CLI wrote a test', async () => {
      bench.answer(exited(SUCCEEDED), NEW_TEST);

      expect(await bench.generate()).toEqual({
        outcome: 'generated',
        tokensUsed: 1500,
        billing: 'subscription',
        windows: {
          fiveHour: {
            utilization: 0.25,
            resetsAt: Instant.fromEpochMilliseconds(RESET_SECONDS * 1000),
          },
          sevenDay: {
            utilization: 0.5,
            resetsAt: Instant.fromEpochMilliseconds(
              RESET_SECONDS * 1000 + A_DAY_MS,
            ),
          },
        },
        refusedToolCalls: [],
        outputReference: 'artifact-1',
      });
    });

    it('should answer no changes when the CLI finished and wrote nothing', async () => {
      bench.answer(exited(SUCCEEDED));

      expect(await bench.generate()).toMatchObject({
        outcome: 'no_changes',
        tokensUsed: 1500,
      });
    });

    it('should see a file the CLI wrote again at the same size', async () => {
      const old = join(bench.folder.root, 'tests/old.test.ts');
      utimesSync(old, 1000, 1000);
      bench.answer(exited(SUCCEEDED), {
        'tests/old.test.ts': 'import "../src/xyz33";\n',
      });

      expect(await bench.generate()).toMatchObject({ outcome: 'generated' });
    });

    it('should see a file the CLI removed', async () => {
      bench.answer(exited(SUCCEEDED));
      bench.sandbox.onRun(() => {
        rmSync(join(bench.folder.root, 'tests/old.test.ts'));
      });

      expect(await bench.generate()).toMatchObject({ outcome: 'generated' });
    });

    it('should keep the raw output for the owner of the attempt', async () => {
      bench.answer(exited(SUCCEEDED), NEW_TEST);

      await bench.generate();

      expect(bench.artifacts.saved).toEqual([
        {
          owner: 'improvement:imp-1:attempt:1',
          label: 'generator-output',
          content: SUCCEEDED,
        },
      ]);
    });

    describe('when the request names an unknown prompt', () => {
      it('should throw UnknownPromptVersionError and start nothing', async () => {
        const generating = bench.generate({
          generator: {
            cli: 'claude_code',
            model: 'claude-test-model',
            promptVersion: '99',
          },
        });

        await expect(generating).rejects.toThrow(UnknownPromptVersionError);
        await expect(generating).rejects.toMatchObject({
          code: 'unknown_prompt_version',
          retryable: false,
        });
        expect(bench.sandbox.requests).toEqual([]);
      });
    });

    describe('when the signal is aborted', () => {
      it('should throw the reason and start nothing', async () => {
        const controller = new AbortController();
        controller.abort(new Error('user_cancelled'));

        await expect(bench.generate({}, controller.signal)).rejects.toThrow(
          'user_cancelled',
        );
        expect(bench.sandbox.requests).toEqual([]);
      });
    });

    describe('when the copy holds a link', () => {
      it('should not follow it, and note a link the CLI adds as written', async () => {
        symlinkSync('/etc', join(bench.folder.root, 'outside'));
        bench.answer(exited(SUCCEEDED));
        bench.sandbox.onRun(() => {
          symlinkSync('/etc/hosts', join(bench.folder.root, 'tests/a.test.ts'));
        });

        expect(await bench.generate()).toMatchObject({ outcome: 'generated' });
        expect(bench.savedOutput()).toContain(
          'tests/a.test.ts was not searched: it is not a plain file.',
        );
      });
    });

    describe('when the CLI writes into the installed packages', () => {
      it('should not see it, since the packages are not listed', async () => {
        bench.folder.write('node_modules/left/index.js', '');
        bench.answer(exited(SUCCEEDED), {
          'node_modules/left/index.js': 'changed',
        });

        expect(await bench.generate()).toMatchObject({ outcome: 'no_changes' });
      });
    });
  });
});
