import { describe, expect, it } from '@jest/globals';

import { findCycles } from '#harness/architecture/graph';

function graphOf(edges: Record<string, string[]>): Map<string, string[]> {
  return new Map(Object.entries(edges));
}

describe('findCycles', () => {
  it('should find nothing in a chain', () => {
    expect(findCycles(graphOf({ a: ['b'], b: ['c'], c: [] }))).toEqual([]);
  });

  it('should find two nodes that point at each other', () => {
    expect(findCycles(graphOf({ a: ['b'], b: ['a'] }))).toEqual([['a', 'b']]);
  });

  it('should find a longer circle once, with sorted members', () => {
    const graph = graphOf({ c: ['a'], a: ['b'], b: ['c'], d: ['a'] });

    expect(findCycles(graph)).toEqual([['a', 'b', 'c']]);
  });

  it('should keep separate circles apart and sorted', () => {
    const graph = graphOf({ x: ['y'], y: ['x'], a: ['b'], b: ['a'] });

    expect(findCycles(graph)).toEqual([
      ['a', 'b'],
      ['x', 'y'],
    ]);
  });

  it('should count a node that points at itself', () => {
    expect(findCycles(graphOf({ a: ['a'], b: [] }))).toEqual([['a']]);
  });

  it('should follow an edge to a node the graph does not list', () => {
    expect(findCycles(graphOf({ a: ['gone'] }))).toEqual([]);
  });

  it('should treat a diamond as no circle', () => {
    const graph = graphOf({ a: ['b', 'c'], b: ['d'], c: ['d'], d: [] });

    expect(findCycles(graph)).toEqual([]);
  });

  it('should give the circles in the same order however the graph is built', () => {
    const edges: [string, string[]][] = [
      ['y', ['z']],
      ['z', ['y']],
      ['a', ['b']],
      ['b', ['a']],
    ];
    const forward = findCycles(new Map(edges));
    const backward = findCycles(new Map([...edges].reverse()));

    expect(forward.map((group) => [...group].sort()[0])).toEqual(['a', 'y']);
    expect(backward).toEqual(forward);
  });
});
