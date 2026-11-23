import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GeneratorCliMissingError } from '#improvement/infrastructure/errors/generator-cli-missing.error';
import { GeneratorFailedError } from '#improvement/infrastructure/errors/generator-failed.error';
import { GeneratorLoginFailedError } from '#improvement/infrastructure/errors/generator-login-failed.error';
import { GeneratorOutputTruncatedError } from '#improvement/infrastructure/errors/generator-output-truncated.error';
import { GeneratorOutputUnreadableError } from '#improvement/infrastructure/errors/generator-output-unreadable.error';
import { GeneratorUnsafeStartError } from '#improvement/infrastructure/errors/generator-unsafe-start.error';
import type { SandboxCommandResult } from '#ports/sandbox.port';
import {
  type GeneratorBench,
  generatorBench,
} from '#tests/support/generator-bench';
import { GENERATOR_TEST_SETTINGS } from '#tests/support/generator-request';
import {
  ALLOWED_TOOLS,
  answerEvent,
  exited,
  initEvent,
  resultEvent,
  streamOf,
} from '#tests/support/generator-stream';

const NEW_TEST = { 'tests/price.test.ts': 'expect(price(2)).toBe(4);\n' };

const LOGIN_TEXT = 'Invalid API key · Please run /login';

let bench: GeneratorBench;

async function faultOf(
  ended: SandboxCommandResult,
): Promise<Record<string, unknown>> {
  bench.answer(ended, NEW_TEST);
  try {
    await bench.generate();
  } catch (error) {
    return error as Record<string, unknown>;
  }
  throw new Error('The call answered where a fault was expected.');
}

beforeEach(() => {
  bench = generatorBench();
});

afterEach(() => {
  bench.folder.remove();
});

describe('ClaudeCodeGenerator', () => {
  describe('when the CLI starts with other tools than the allowed ones', () => {
    it.each([
      ['a tool more', initEvent({ tools: [...ALLOWED_TOOLS, 'Bash'] })],
      ['a tool less', initEvent({ tools: ['Read', 'Write'] })],
      [
        'a tool server',
        initEvent({ mcp_servers: [{ name: 'trap', status: 'connected' }] }),
      ],
    ])('should throw GeneratorUnsafeStartError for %s', async (_, init) => {
      const fault = await faultOf(exited(streamOf(init, resultEvent())));

      expect(fault).toBeInstanceOf(GeneratorUnsafeStartError);
      expect(fault).toMatchObject({
        code: 'generator_unsafe_start',
        retryable: false,
      });
      expect(String(fault['message'])).toContain('Raw output: artifact-1.');
    });

    it('should throw for a second start with a shell, also after the time limit', async () => {
      const fault = await faultOf({
        outcome: 'timed_out',
        exitCode: null,
        output: streamOf(initEvent(), initEvent({ tools: ['Bash'] })),
        outputTruncated: false,
        durationMs: 600_000,
      });

      expect(fault).toBeInstanceOf(GeneratorUnsafeStartError);
      expect(String(fault['message'])).toContain('[Bash]');
    });
  });

  describe('when the sandbox dropped the start report of a long output', () => {
    it('should throw GeneratorOutputTruncatedError', async () => {
      const output = streamOf(initEvent(), resultEvent()).slice(20);

      const fault = await faultOf(exited(output, { outputTruncated: true }));

      expect(fault).toBeInstanceOf(GeneratorOutputTruncatedError);
      expect(fault).toMatchObject({ retryable: false });
    });
  });

  describe('when the CLI says it succeeded and printed no result', () => {
    it('should throw GeneratorOutputUnreadableError', async () => {
      const fault = await faultOf(exited(streamOf(initEvent())));

      expect(fault).toBeInstanceOf(GeneratorOutputUnreadableError);
      expect(fault).toMatchObject({
        code: 'generator_output_unreadable',
        retryable: false,
      });
    });

    it('should throw it as well with no start report', async () => {
      const fault = await faultOf(exited('Done.\n'));

      expect(fault).toBeInstanceOf(GeneratorOutputUnreadableError);
    });
  });

  describe('when an event the adapter relies on has another shape', () => {
    it.each([
      ['result', streamOf(initEvent(), resultEvent({ usage: {} }))],
      ['system:init', streamOf(initEvent({ tools: 'Read' }), resultEvent())],
      [
        'rate_limit_event',
        streamOf(
          initEvent(),
          { type: 'rate_limit_event', rate_limit_info: { status: 7 } },
          resultEvent(),
        ),
      ],
    ])(
      'should name %s in GeneratorOutputUnreadableError',
      async (kind, output) => {
        const fault = await faultOf(exited(output));

        expect(fault).toBeInstanceOf(GeneratorOutputUnreadableError);
        expect(String(fault['message'])).toContain(kind);
      },
    );
  });

  describe('when the sandbox finds no CLI to start', () => {
    it('should throw GeneratorCliMissingError', async () => {
      const fault = await faultOf(
        exited('exec: "claude": executable file not found in $PATH\n', {
          exitCode: 127,
        }),
      );

      expect(fault).toBeInstanceOf(GeneratorCliMissingError);
      expect(fault).toMatchObject({
        code: 'generator_cli_missing',
        retryable: false,
      });
    });
  });

  describe('when the CLI cannot log in', () => {
    it.each([
      [
        'its answer says so',
        streamOf(
          initEvent(),
          answerEvent(LOGIN_TEXT, { error: 'authentication_failed' }),
          resultEvent({ is_error: true, result: LOGIN_TEXT }),
        ),
      ],
      [
        'its result says so',
        streamOf(
          initEvent(),
          resultEvent({ is_error: true, result: LOGIN_TEXT }),
        ),
      ],
      ['it says so before it starts', `${LOGIN_TEXT}\n`],
      ['it says so before its result', streamOf(initEvent(), LOGIN_TEXT)],
    ])('should throw GeneratorLoginFailedError when %s', async (_, output) => {
      const fault = await faultOf(exited(output, { exitCode: 1 }));

      expect(fault).toBeInstanceOf(GeneratorLoginFailedError);
      expect(fault).toMatchObject({
        code: 'generator_login_failed',
        retryable: false,
      });
      expect(String(fault['message'])).toContain('CLAUDE_CODE_OAUTH_TOKEN');
    });

    it('should start nothing when no credential is set', async () => {
      bench.folder.remove();
      bench = generatorBench({
        ...GENERATOR_TEST_SETTINGS,
        credential: { variable: 'CLAUDE_CODE_OAUTH_TOKEN', value: null },
      });

      await expect(bench.generate()).rejects.toThrow(
        new GeneratorLoginFailedError(
          'No credential is set in CLAUDE_CODE_OAUTH_TOKEN, so the CLI ' +
            'cannot log in. Set it and start the service again.',
        ),
      );
      expect(bench.sandbox.requests).toEqual([]);
    });
  });

  describe('when the CLI fails for another reason', () => {
    it('should throw GeneratorFailedError with what the CLI said', async () => {
      const fault = await faultOf(
        exited(
          streamOf(
            initEvent(),
            resultEvent({
              subtype: 'error_during_execution',
              is_error: true,
              result: null,
              errors: ['API Error: 529 Overloaded'],
            }),
          ),
          { exitCode: 1 },
        ),
      );

      expect(fault).toBeInstanceOf(GeneratorFailedError);
      expect(fault).toMatchObject({
        code: 'generator_failed',
        retryable: true,
      });
      expect(String(fault['message'])).toContain(
        'failed with error_during_execution. It said: API Error: 529 Overloaded',
      );
    });

    it.each([
      ['before it starts', '', 143],
      ['after it starts', streamOf(initEvent()), 1],
    ])(
      'should throw GeneratorFailedError when it ends %s with no result',
      async (_, output, exitCode) => {
        const fault = await faultOf(exited(output, { exitCode }));

        expect(fault).toBeInstanceOf(GeneratorFailedError);
        expect(String(fault['message'])).toContain(
          `exit code ${String(exitCode)}`,
        );
      },
    );
  });
});
