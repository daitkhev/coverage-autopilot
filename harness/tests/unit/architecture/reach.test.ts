import { describe, expect, it } from 'vitest';

import { chainFrom } from '#harness/architecture/reach';

const GRAPH: Readonly<Record<string, readonly string[]>> = {
  a: ['b', 'c'],
  b: ['d'],
  c: ['e'],
  d: ['e', 'a'],
  e: [],
};

function chain(start: string, lookedFor: string): string[] | undefined {
  return chainFrom(
    start,
    (path) => GRAPH[path] ?? [],
    (path) => path === lookedFor,
  );
}

describe('chainFrom', () => {
  it('should give the chain with both of its ends', () => {
    expect(chain('b', 'e')).toEqual(['b', 'd', 'e']);
  });

  it('should give the shortest chain, and the first of two that are equal', () => {
    expect(chain('a', 'e')).toEqual(['a', 'c', 'e']);
    expect(chain('a', 'd')).toEqual(['a', 'b', 'd']);
  });

  it('should take the start itself when it is looked for', () => {
    expect(chain('a', 'a')).toEqual(['a']);
  });

  it('should give nothing when no chain leads there', () => {
    expect(chain('e', 'a')).toBeUndefined();
    expect(chain('a', 'nowhere')).toBeUndefined();
  });

  it('should come to an end in a circle', () => {
    expect(chain('d', 'c')).toEqual(['d', 'a', 'c']);
  });

  it('should not ask about a file it does not have to visit', () => {
    const asked: string[] = [];

    chainFrom(
      'a',
      (path) => GRAPH[path] ?? [],
      (path) => {
        asked.push(path);
        return path === 'c';
      },
    );

    expect(asked).toEqual(['a', 'b', 'c']);
  });
});
