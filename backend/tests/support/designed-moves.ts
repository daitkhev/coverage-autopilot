import type { ImprovementStatus } from '@coverage-autopilot/api-contracts/statuses';

/** A final status never changes again. */
const FINAL_STATUSES: readonly ImprovementStatus[] = [
  'completed',
  'skipped',
  'failed',
  'cancelled',
];

/** Every status that is not final may end in one of these. */
const ENDINGS: readonly ImprovementStatus[] = ['failed', 'cancelled'];

/**
 * The moves of the flowchart of the design, written out here rather than
 * taken from the code, so the code is held to the design. A wait for the
 * window of the generator sits beside generating, as the contract names
 * it.
 */
const DESIGNED: Readonly<
  Record<ImprovementStatus, readonly ImprovementStatus[]>
> = {
  created: ['analyzing'],
  analyzing: ['generating', 'skipped'],
  generating: ['verifying', 'waiting_for_limit'],
  waiting_for_limit: ['generating'],
  verifying: ['generating', 'publishing', 'awaiting_approval'],
  awaiting_approval: ['publishing'],
  publishing: ['completed'],
  completed: [],
  skipped: [],
  failed: [],
  cancelled: [],
};

export function isFinal(status: ImprovementStatus): boolean {
  return FINAL_STATUSES.includes(status);
}

/** The statuses one or more designed moves lead to from `from`. */
function ahead(from: ImprovementStatus): Set<ImprovementStatus> {
  const reached = new Set<ImprovementStatus>();
  const waiting = [...DESIGNED[from]];
  for (let next = waiting.pop(); next !== undefined; next = waiting.pop()) {
    if (!reached.has(next)) {
      reached.add(next);
      waiting.push(...DESIGNED[next]);
    }
  }
  return reached;
}

/**
 * Whether an improvement seen in `from` may be seen next in `to`. A look
 * now and then misses the statuses in between, so any number of designed
 * moves may lie between two looks.
 */
function mayFollow(from: ImprovementStatus, to: ImprovementStatus): boolean {
  if (from === to) {
    return true;
  }
  if (isFinal(from)) {
    return false;
  }
  return ENDINGS.includes(to) || ahead(from).has(to);
}

/** Each pair of looks in a row that no designed moves lead between. */
export function movesAgainstDesign(
  seen: readonly ImprovementStatus[],
): string[] {
  return seen.slice(1).flatMap((to, index) => {
    const from = seen[index] ?? to;
    return mayFollow(from, to) ? [] : [`${from} became ${to}`];
  });
}
