import type { SandboxCommandResult } from '#ports/sandbox.port';

/** One line of `--output-format stream-json`, written by hand. */
export type StreamEvent = Readonly<Record<string, unknown>>;

/** The tools of the protected start, as `--tools` names them. */
export const ALLOWED_TOOLS: readonly string[] = [
  'Read',
  'Write',
  'Edit',
  'Glob',
  'Grep',
];

/** A moment of a reset in epoch seconds: 2026-11-21T15:00:00.000Z. */
export const RESET_SECONDS = 1_795_273_200;

/** The weekly window resets a day after the five-hour one. */
const A_DAY_SECONDS = 86_400;

/** The moment a test runs at, three hours before that reset. */
export const TEST_NOW = '2026-11-21T12:00:00.000Z';

/** The start report of a protected start under a subscription. */
export function initEvent(change: StreamEvent = {}): StreamEvent {
  return {
    type: 'system',
    subtype: 'init',
    cwd: '/work/copy',
    session_id: 'session-1',
    tools: [...ALLOWED_TOOLS],
    mcp_servers: [],
    model: 'claude-test-model',
    permissionMode: 'acceptEdits',
    apiKeySource: 'none',
    ...change,
  };
}

/** An answer of the model, with the placeholder tokens the stream has. */
export function answerEvent(
  text: string,
  change: StreamEvent = {},
): StreamEvent {
  return {
    type: 'assistant',
    message: {
      role: 'assistant',
      content: [{ type: 'text', text }],
      usage: { input_tokens: 1, output_tokens: 1 },
    },
    session_id: 'session-1',
    ...change,
  };
}

/** The state of the usage limits as the CLI reports it. */
export function rateLimitEvent(info: StreamEvent): StreamEvent {
  return {
    type: 'rate_limit_event',
    rate_limit_info: info,
    uuid: 'uuid-1',
    session_id: 'session-1',
  };
}

/** The two windows of a subscription, with the share used of each. */
export function unifiedWindows(
  fiveHour: number,
  sevenDay: number,
): StreamEvent {
  return {
    five_hour: {
      utilization: fiveHour,
      resetsAt: RESET_SECONDS,
      status: fiveHour < 1 ? 'allowed' : 'rejected',
    },
    seven_day: {
      utilization: sevenDay,
      resetsAt: RESET_SECONDS + A_DAY_SECONDS,
      status: sevenDay < 1 ? 'allowed' : 'rejected',
    },
  };
}

/** The last event of a run that succeeded. */
export function resultEvent(change: StreamEvent = {}): StreamEvent {
  return {
    type: 'result',
    subtype: 'success',
    is_error: false,
    duration_ms: 42_000,
    num_turns: 4,
    result: 'Added tests/price.test.ts.',
    session_id: 'session-1',
    total_cost_usd: 0.12,
    usage: {
      input_tokens: 1200,
      output_tokens: 300,
      cache_read_input_tokens: 5000,
      cache_creation_input_tokens: 700,
    },
    permission_denials: [],
    stop_reason: 'end_turn',
    terminal_reason: 'completed',
    ...change,
  };
}

/** The events as the CLI prints them: one JSON object a line. */
export function streamOf(...events: readonly (StreamEvent | string)[]): string {
  return events
    .map((event) =>
      typeof event === 'string' ? `${event}\n` : `${JSON.stringify(event)}\n`,
    )
    .join('');
}

/** A run that ended by itself, as the sandbox answers it. */
export function exited(
  output: string,
  change: Partial<SandboxCommandResult> = {},
): SandboxCommandResult {
  return {
    outcome: 'exited',
    exitCode: 0,
    output,
    outputTruncated: false,
    durationMs: 42_000,
    ...change,
  };
}
