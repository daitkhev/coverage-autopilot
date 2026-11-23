import { describe, expect, it } from 'vitest';

import {
  type CliStream,
  readStream,
  wholeLinesOf,
} from '#improvement/infrastructure/generator/claude-stream';
import {
  ALLOWED_TOOLS,
  answerEvent,
  exited,
  initEvent,
  rateLimitEvent,
  resultEvent,
  streamOf,
} from '#tests/support/generator-stream';

function read(output: string): CliStream {
  return readStream(exited(output));
}

describe('readStream', () => {
  it('should read the events the adapter relies on and pass over the rest', () => {
    const stream = read(
      streamOf(
        initEvent({ future_field: { nested: true } }),
        { type: 'system', subtype: 'compact_boundary' },
        { type: 'user', message: { content: [] } },
        { type: 'stream_event_of_a_later_version' },
        answerEvent('Writing the test.'),
        resultEvent(),
      ),
    );

    expect(stream.inits).toHaveLength(1);
    expect(stream.inits[0]?.tools).toEqual(ALLOWED_TOOLS);
    expect(stream.result?.usage).toMatchObject({
      input_tokens: 1200,
      output_tokens: 300,
    });
    expect(stream.unreadable).toEqual([]);
    expect(stream.plainText).toBe('');
  });

  it('should keep the last state of the limits and the last result', () => {
    const stream = read(
      streamOf(
        rateLimitEvent({ status: 'allowed' }),
        rateLimitEvent({ status: 'rejected', rateLimitType: 'five_hour' }),
        resultEvent({ subtype: 'first' }),
        resultEvent({ subtype: 'last' }),
      ),
    );

    expect(stream.rateLimit).toMatchObject({
      status: 'rejected',
      rateLimitType: 'five_hour',
    });
    expect(stream.result?.subtype).toBe('last');
  });

  it('should collect the errors of the answers and pass over an answer of another shape', () => {
    const stream = read(
      streamOf(
        answerEvent('No.', { error: 'authentication_failed' }),
        answerEvent('No.', { error: { kind: 'other' } }),
        answerEvent('Yes.'),
      ),
    );

    expect([...stream.answerErrors]).toEqual(['authentication_failed']);
    expect(stream.unreadable).toEqual([]);
  });

  it('should keep the lines that are no event as text', () => {
    const stream = read(
      streamOf('Warning: no stdin data received', '42', 'null', '{"type":7}'),
    );

    expect(stream.plainText).toBe(
      'Warning: no stdin data received\n42\nnull\n{"type":7}',
    );
  });

  it('should record an event it relies on that has another shape', () => {
    const stream = read(
      streamOf(
        initEvent({ mcp_servers: 'none' }),
        rateLimitEvent({ status: 'allowed', resetsAt: -1 }),
        resultEvent({ is_error: 'no' }),
      ),
    );

    expect(stream.unreadable).toEqual([
      'system:init',
      'rate_limit_event',
      'result',
    ]);
    expect(stream.inits).toEqual([]);
    expect(stream.rateLimit).toBeNull();
    expect(stream.result).toBeNull();
  });

  it('should read the texts of a failure as text, whatever their shape', () => {
    const stream = read(
      streamOf(resultEvent({ result: { nested: 1 }, errors: 'not a list' })),
    );

    expect(stream.result).toMatchObject({ result: '', errors: [] });
  });

  describe('when the sandbox kept only the end of the output', () => {
    it('should not read the first line kept', () => {
      const output = streamOf(initEvent(), resultEvent()).slice(10);

      const stream = readStream(exited(output, { outputTruncated: true }));

      expect(stream.inits).toEqual([]);
      expect(stream.result).not.toBeNull();
      expect(stream.plainText).toBe('');
    });
  });
});

describe('wholeLinesOf', () => {
  it('should give an output that was kept whole as it is', () => {
    expect(wholeLinesOf(exited('a\nb'))).toBe('a\nb');
  });

  it('should drop the first line of a cut output, and a cut output of one line', () => {
    expect(wholeLinesOf(exited('ut a\nb\n', { outputTruncated: true }))).toBe(
      'b\n',
    );
    expect(wholeLinesOf(exited('ut a', { outputTruncated: true }))).toBe('');
  });

  it('should drop the last line a command stopped at its time limit left open', () => {
    const stopped = { outcome: 'timed_out', exitCode: null } as const;

    expect(wholeLinesOf(exited('a\nb\nhalf a li', stopped))).toBe('a\nb\n');
    expect(
      wholeLinesOf(
        exited('ut a\nb\nhalf', { ...stopped, outputTruncated: true }),
      ),
    ).toBe('b\n');
  });
});
