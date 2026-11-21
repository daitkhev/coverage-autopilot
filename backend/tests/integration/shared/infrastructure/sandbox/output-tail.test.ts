import { describe, expect, it } from 'vitest';

import { OutputTail } from '#infrastructure/sandbox/output-tail';

function tailOf(limit: number, ...chunks: (string | Buffer)[]): OutputTail {
  const tail = new OutputTail(limit);
  for (const chunk of chunks) {
    tail.append(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return tail;
}

describe('OutputTail', () => {
  it('should keep an output within its limit whole', () => {
    const tail = tailOf(10, 'abc', 'def');

    expect(tail.text()).toBe('abcdef');
    expect(tail.truncated).toBe(false);
  });

  it('should keep an output of exactly its limit whole', () => {
    const tail = tailOf(6, 'abc', 'def');

    expect(tail.text()).toBe('abcdef');
    expect(tail.truncated).toBe(false);
  });

  it('should keep nothing of no output', () => {
    expect(tailOf(6).text()).toBe('');
  });

  it('should keep the last bytes of a longer output', () => {
    const tail = tailOf(4, 'abc', 'def');

    expect(tail.text()).toBe('cdef');
    expect(tail.truncated).toBe(true);
  });

  it('should drop whole chunks from the start as the output grows', () => {
    const tail = tailOf(5, 'first-', 'second-', 'third', '!');

    expect(tail.text()).toBe('hird!');
    expect(tail.truncated).toBe(true);
  });

  it('should start at a whole character', () => {
    const tail = tailOf(5, 'start: ééé');

    expect(tail.text()).toBe('éé');
    expect(tail.truncated).toBe(true);
  });

  it('should join a character that two chunks split', () => {
    const check = Buffer.from('✓');
    const tail = tailOf(
      10,
      Buffer.concat([Buffer.from('ok '), check.subarray(0, 1)]),
      check.subarray(1),
    );

    expect(tail.text()).toBe('ok ✓');
  });

  it('should start at a whole character after it dropped a chunk', () => {
    const check = Buffer.from('✓');
    const tail = tailOf(
      3,
      Buffer.concat([Buffer.from('ab'), check.subarray(0, 1)]),
      Buffer.concat([check.subarray(1), Buffer.from('cd')]),
      Buffer.from('e'),
    );

    expect(tail.text()).toBe('cde');
  });
});
