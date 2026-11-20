export type Graph = ReadonlyMap<string, readonly string[]>;

interface Walk {
  readonly graph: Graph;
  readonly index: Map<string, number>;
  readonly low: Map<string, number>;
  readonly stack: string[];
  readonly onStack: Set<string>;
  readonly groups: string[][];
}

function lower(walk: Walk, node: string, value: number | undefined): void {
  const current = walk.low.get(node);
  if (current !== undefined && value !== undefined && value < current) {
    walk.low.set(node, value);
  }
}

function popGroup(walk: Walk, root: string): string[] {
  const group: string[] = [];
  let member = walk.stack.pop();
  while (member !== undefined) {
    walk.onStack.delete(member);
    group.push(member);
    member = member === root ? undefined : walk.stack.pop();
  }
  return group.sort();
}

function visit(walk: Walk, node: string): void {
  const order = walk.index.size;
  walk.index.set(node, order);
  walk.low.set(node, order);
  walk.stack.push(node);
  walk.onStack.add(node);
  for (const next of walk.graph.get(node) ?? []) {
    if (!walk.index.has(next)) {
      visit(walk, next);
      lower(walk, node, walk.low.get(next));
    } else if (walk.onStack.has(next)) {
      lower(walk, node, walk.index.get(next));
    }
  }
  if (walk.low.get(node) === order) {
    walk.groups.push(popGroup(walk, node));
  }
}

function isCycle(graph: Graph, group: readonly string[]): boolean {
  const only = group[0];
  if (group.length > 1 || only === undefined) {
    return group.length > 1;
  }
  return (graph.get(only) ?? []).includes(only);
}

/**
 * Groups of nodes that reach each other, by Tarjan's algorithm. A node that
 * points at itself is a group of one. Groups and their members are sorted.
 */
export function findCycles(graph: Graph): string[][] {
  const walk: Walk = {
    graph,
    index: new Map(),
    low: new Map(),
    stack: [],
    onStack: new Set(),
    groups: [],
  };
  for (const node of [...graph.keys()].sort()) {
    if (!walk.index.has(node)) {
      visit(walk, node);
    }
  }
  return walk.groups
    .filter((group) => isCycle(graph, group))
    .sort((left, right) => ((left[0] ?? '') < (right[0] ?? '') ? -1 : 1));
}
