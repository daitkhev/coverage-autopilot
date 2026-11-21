import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GeneratorFailedError } from '#improvement/infrastructure/errors/generator-failed.error';
import {
  type GeneratorBench,
  generatorBench,
} from '#tests/support/generator-bench';
import {
  CREDENTIAL_VALUE,
  GENERATOR_TEST_SETTINGS,
} from '#tests/support/generator-request';
import {
  ALLOWED_TOOLS,
  answerEvent,
  exited,
  initEvent,
  resultEvent,
  streamOf,
} from '#tests/support/generator-stream';

const SUCCEEDED = streamOf(initEvent(), resultEvent());

let bench: GeneratorBench;

beforeEach(() => {
  bench = generatorBench();
});

afterEach(() => {
  bench.folder.remove();
});

describe('ClaudeCodeGenerator', () => {
  describe('when the CLI writes the credential into a new file', () => {
    it('should answer credential exposed', async () => {
      bench.answer(exited(SUCCEEDED), {
        'tests/price.test.ts': `const token = '${CREDENTIAL_VALUE}';\n`,
      });

      expect(await bench.generate()).toMatchObject({
        outcome: 'credential_exposed',
        tokensUsed: 1500,
      });
    });

    it('should answer it before a fault of the same run', async () => {
      bench.answer(
        exited(streamOf(initEvent({ tools: [...ALLOWED_TOOLS, 'Bash'] }))),
        { 'tests/leak.test.ts': CREDENTIAL_VALUE },
      );

      expect(await bench.generate()).toMatchObject({
        outcome: 'credential_exposed',
      });
    });

    it('should answer it after the time limit, judged by its credential', async () => {
      bench.answer(
        {
          outcome: 'timed_out',
          exitCode: null,
          output: '',
          outputTruncated: false,
          durationMs: 600_000,
        },
        { 'tests/leak.test.ts': CREDENTIAL_VALUE },
      );

      expect(await bench.generate()).toMatchObject({
        outcome: 'credential_exposed',
        billing: 'subscription',
        tokensUsed: 0,
      });
    });
  });

  describe('when the CLI names a new file after the credential', () => {
    it('should answer credential exposed', async () => {
      bench.answer(exited(SUCCEEDED), {
        [`tests/${CREDENTIAL_VALUE}.test.ts`]: 'it("works", () => {});\n',
      });

      expect(await bench.generate()).toMatchObject({
        outcome: 'credential_exposed',
      });
      expect(bench.savedOutput()).not.toContain(CREDENTIAL_VALUE);
    });
  });

  describe('when the output holds the credential', () => {
    it('should replace it in what the store keeps', async () => {
      bench.answer(
        exited(
          streamOf(
            initEvent(),
            answerEvent(`The token is ${CREDENTIAL_VALUE}.`),
            resultEvent(),
          ),
        ),
      );

      await bench.generate();

      expect(bench.savedOutput()).not.toContain(CREDENTIAL_VALUE);
      expect(bench.savedOutput()).toContain('The token is [credential].');
    });

    it('should replace it in the message of a fault', async () => {
      bench.answer(
        exited(
          streamOf(
            initEvent(),
            resultEvent({
              is_error: true,
              result: `API Error: 400 bad header ${CREDENTIAL_VALUE}`,
            }),
          ),
          { exitCode: 1 },
        ),
      );

      const generating = bench.generate();

      await expect(generating).rejects.toThrow(GeneratorFailedError);
      await expect(generating).rejects.toThrow('bad header [credential]');
      await expect(generating).rejects.not.toThrow(CREDENTIAL_VALUE);
    });

    it('should drop a first line the sandbox cut, which may hold a part of it', async () => {
      const output = `${CREDENTIAL_VALUE.slice(5)} end of a line\n${SUCCEEDED}`;
      bench.answer(exited(output, { outputTruncated: true }));

      await bench.generate();

      expect(bench.savedOutput()).toBe(SUCCEEDED);
    });

    it('should keep nothing of a cut output of one line', async () => {
      bench.answer(
        exited(`${CREDENTIAL_VALUE.slice(5)} and more`, {
          outputTruncated: true,
        }),
      );

      await expect(bench.generate()).rejects.toThrow('start report');
      expect(bench.savedOutput()).toBe('');
    });

    it('should drop a last line a run stopped at its time limit left open', async () => {
      bench.answer({
        outcome: 'timed_out',
        exitCode: null,
        output: `${SUCCEEDED}{"type":"assistant","text":"${CREDENTIAL_VALUE.slice(0, 9)}`,
        outputTruncated: false,
        durationMs: 600_000,
      });

      expect(await bench.generate()).toMatchObject({
        outcome: 'limit_reached',
      });
      expect(bench.savedOutput()).toBe(SUCCEEDED);
    });
  });

  describe('when a written file cannot be searched', () => {
    it('should note a file too large and count it as written', async () => {
      bench.folder.remove();
      bench = generatorBench({
        ...GENERATOR_TEST_SETTINGS,
        scan: { maxFiles: 1, maxFileBytes: 8 },
      });
      bench.answer(exited(SUCCEEDED), {
        'tests/a.test.ts': 'a test longer than eight bytes',
        'tests/b.test.ts': 'b',
      });

      expect(await bench.generate()).toMatchObject({ outcome: 'generated' });
      expect(bench.savedOutput()).toBe(
        `${SUCCEEDED}\n--- notes of the generator adapter ---\n` +
          'tests/a.test.ts was not searched: it is larger than any file the ' +
          'service reads.\n' +
          '1 more written files were not searched.\n',
      );
    });
  });
});
