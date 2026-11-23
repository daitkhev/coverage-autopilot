import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Instant } from '#kernel/time/instant';
import {
  type GeneratorBench,
  generatorBench,
} from '#tests/support/generator-bench';
import { GENERATOR_TEST_SETTINGS } from '#tests/support/generator-request';
import {
  answerEvent,
  exited,
  initEvent,
  rateLimitEvent,
  RESET_SECONDS,
  resultEvent,
  type StreamEvent,
  streamOf,
  TEST_NOW,
  unifiedWindows,
} from '#tests/support/generator-stream';

const NEW_TEST = { 'tests/price.test.ts': 'expect(price(2)).toBe(4);\n' };

/** A call that failed because a limit of the account is spent. */
function spent(info: StreamEvent): string {
  return streamOf(
    initEvent(),
    rateLimitEvent({ status: 'rejected', ...info }),
    answerEvent(`Claude AI usage limit reached|${String(RESET_SECONDS)}`),
    resultEvent({
      is_error: true,
      result: `Claude AI usage limit reached|${String(RESET_SECONDS)}`,
      usage: { input_tokens: 10, output_tokens: 0 },
    }),
  );
}

let bench: GeneratorBench;

beforeEach(() => {
  bench = generatorBench();
});

afterEach(() => {
  bench.folder.remove();
});

describe('ClaudeCodeGenerator', () => {
  describe('when the call reaches its limit of turns', () => {
    it('should answer limit reached with the tokens of the result', async () => {
      bench.answer(
        exited(
          streamOf(
            initEvent(),
            resultEvent({ subtype: 'error_max_turns', is_error: true }),
          ),
          { exitCode: 1 },
        ),
      );

      expect(await bench.generate()).toMatchObject({
        outcome: 'limit_reached',
        tokensUsed: 1500,
      });
    });
  });

  describe('when the call passes its limit of cost after it wrote a file', () => {
    it('should answer limit reached and not generated', async () => {
      bench.answer(
        exited(
          streamOf(
            initEvent(),
            resultEvent({
              subtype: 'error_max_budget_usd',
              is_error: true,
              terminal_reason: 'budget_exhausted',
              total_cost_usd: 0.00089,
            }),
          ),
          { exitCode: 1 },
        ),
        NEW_TEST,
      );

      expect(await bench.generate()).toMatchObject({
        outcome: 'limit_reached',
      });
    });
  });

  describe('when the sandbox stops the call at its time limit', () => {
    it('should answer limit reached with no tokens', async () => {
      bench.answer({
        outcome: 'timed_out',
        exitCode: null,
        output: streamOf(initEvent(), answerEvent('I read the source.')),
        outputTruncated: false,
        durationMs: 600_000,
      });

      expect(await bench.generate()).toMatchObject({
        outcome: 'limit_reached',
        tokensUsed: 0,
        billing: 'subscription',
        windows: null,
      });
    });

    it('should take who pays from the credential when the CLI said nothing', async () => {
      bench.folder.remove();
      bench = generatorBench({
        ...GENERATOR_TEST_SETTINGS,
        credential: { variable: 'ANTHROPIC_API_KEY', value: 'not-a-key-42' },
      });
      bench.answer({
        outcome: 'timed_out',
        exitCode: null,
        output: '',
        outputTruncated: false,
        durationMs: 600_000,
      });

      expect(await bench.generate()).toMatchObject({
        outcome: 'limit_reached',
        billing: 'api_key',
      });
    });
  });

  describe('when the CLI refused tool calls', () => {
    it('should report each as the tool and its target', async () => {
      bench.answer(
        exited(
          streamOf(
            initEvent(),
            resultEvent({
              permission_denials: [
                {
                  tool_name: 'Read',
                  tool_use_id: 'toolu_1',
                  tool_input: { file_path: '/etc/hosts' },
                },
                {
                  tool_name: 'Bash',
                  tool_use_id: 'toolu_2',
                  tool_input: {
                    command: 'curl https://example.com\n\u001b[2J',
                  },
                },
                { tool_name: 'Task', tool_use_id: 'toolu_3', tool_input: 7 },
              ],
            }),
          ),
        ),
        NEW_TEST,
      );

      expect(await bench.generate()).toMatchObject({
        outcome: 'generated',
        refusedToolCalls: [
          'Read /etc/hosts',
          'Bash curl https://example.com [2J',
          'Task',
        ],
      });
    });
  });

  describe('when the five-hour window of the subscription is spent', () => {
    it('should answer window exhausted with the moment it opens', async () => {
      bench.answer(
        exited(
          spent({
            rateLimitType: 'five_hour',
            resetsAt: RESET_SECONDS,
            unifiedWindows: unifiedWindows(1, 0.4),
          }),
          { exitCode: 1 },
        ),
      );

      const result = await bench.generate();

      expect(result).toMatchObject({
        outcome: 'window_exhausted',
        resumesAt: Instant.fromEpochMilliseconds(RESET_SECONDS * 1000),
        tokensUsed: 10,
        windows: {
          fiveHour: { utilization: 1 },
          sevenDay: { utilization: 0.4 },
        },
      });
    });

    it('should read the moment of the window when the limit names none', async () => {
      bench.answer(
        exited(
          spent({
            rateLimitType: 'five_hour',
            unifiedWindows: unifiedWindows(1.02, 0.4),
          }),
          { exitCode: 1 },
        ),
      );

      expect(await bench.generate()).toMatchObject({
        outcome: 'window_exhausted',
        resumesAt: Instant.fromEpochMilliseconds(RESET_SECONDS * 1000),
        windows: { fiveHour: { utilization: 1 } },
      });
    });

    it('should resume now when the moment it names has passed', async () => {
      bench.answer(
        exited(
          spent({
            rateLimitType: 'five_hour',
            resetsAt: RESET_SECONDS - 86_400,
          }),
          { exitCode: 1 },
        ),
      );

      expect(await bench.generate()).toMatchObject({
        outcome: 'window_exhausted',
        resumesAt: Instant.parse(TEST_NOW),
        windows: null,
      });
    });

    it('should not say when it opens when the CLI does not', async () => {
      bench.answer(
        exited(spent({ rateLimitType: 'five_hour' }), { exitCode: 1 }),
      );

      expect(await bench.generate()).toMatchObject({
        outcome: 'window_exhausted',
        resumesAt: null,
      });
    });

    it('should know the spent window when the CLI printed no result', async () => {
      bench.answer(
        exited(
          streamOf(
            initEvent(),
            rateLimitEvent({
              status: 'rejected',
              rateLimitType: 'five_hour',
              resetsAt: RESET_SECONDS,
            }),
          ),
          { exitCode: 1 },
        ),
      );

      expect(await bench.generate()).toMatchObject({
        outcome: 'window_exhausted',
        tokensUsed: 0,
      });
    });
  });

  describe('when a longer limit of the account is spent', () => {
    it.each(['seven_day', 'seven_day_opus', 'overage'])(
      'should answer quota exhausted for %s',
      async (rateLimitType) => {
        bench.answer(exited(spent({ rateLimitType }), { exitCode: 1 }));

        const result = await bench.generate();

        expect(result.outcome).toBe('quota_exhausted');
        expect(result).not.toHaveProperty('resumesAt');
      },
    );

    it('should answer quota exhausted when a key has no credit left', async () => {
      bench.answer(
        exited(
          streamOf(
            initEvent({ apiKeySource: 'ANTHROPIC_API_KEY' }),
            answerEvent('Credit balance is too low', {
              error: 'billing_error',
            }),
            resultEvent({
              is_error: true,
              result: 'Credit balance is too low',
            }),
          ),
          { exitCode: 1 },
        ),
      );

      expect(await bench.generate()).toMatchObject({
        outcome: 'quota_exhausted',
        billing: 'api_key',
      });
    });
  });

  describe('when a key pays', () => {
    it('should report no windows, whatever the CLI said of them', async () => {
      bench.answer(
        exited(
          streamOf(
            initEvent({ apiKeySource: 'ANTHROPIC_API_KEY' }),
            rateLimitEvent({
              status: 'allowed',
              unifiedWindows: unifiedWindows(0.1, 0.1),
            }),
            resultEvent(),
          ),
        ),
      );

      expect(await bench.generate()).toMatchObject({
        billing: 'api_key',
        windows: null,
      });
    });
  });

  describe('when a limit is spent and the call still succeeded', () => {
    it('should answer what the call did', async () => {
      const limit = { status: 'rejected', rateLimitType: 'seven_day' };
      bench.answer(
        exited(streamOf(initEvent(), rateLimitEvent(limit), resultEvent())),
        NEW_TEST,
      );

      expect((await bench.generate()).outcome).toBe('generated');
    });
  });
});
