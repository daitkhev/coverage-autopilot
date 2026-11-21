/** How far an improvement has come, in the order of the contract. */
export const IMPROVEMENT_STATUSES = [
  'created',
  'analyzing',
  'generating',
  'waiting_for_limit',
  'verifying',
  'awaiting_approval',
  'publishing',
  'completed',
  'failed',
  'cancelled',
  'skipped',
] as const;

export type ImprovementStatus = (typeof IMPROVEMENT_STATUSES)[number];

/** What an improvement that does not work waits for, as it knows it. */
export type ImprovementWait = 'approval' | 'limit';

/** A final status never changes again. */
const FINAL: readonly ImprovementStatus[] = [
  'completed',
  'skipped',
  'failed',
  'cancelled',
];

/**
 * Where a status leads, besides `failed` and `cancelled`, which every
 * status that is not final leads to. `generating` follows `verifying`
 * when the gate rejected a patch, as the next attempt.
 */
const NEXT: Readonly<Record<ImprovementStatus, readonly ImprovementStatus[]>> =
  {
    created: ['analyzing'],
    analyzing: ['generating', 'skipped'],
    generating: ['verifying', 'waiting_for_limit'],
    waiting_for_limit: ['generating'],
    verifying: ['generating', 'awaiting_approval', 'publishing'],
    awaiting_approval: ['publishing'],
    publishing: ['completed'],
    completed: [],
    failed: [],
    cancelled: [],
    skipped: [],
  };

/** Time in these is not work, so it spends none of the budget. */
const WAITS: Readonly<Partial<Record<ImprovementStatus, ImprovementWait>>> = {
  waiting_for_limit: 'limit',
  awaiting_approval: 'approval',
};

const ENDINGS: readonly ImprovementStatus[] = ['failed', 'cancelled'];

export function isFinal(status: ImprovementStatus): boolean {
  return FINAL.includes(status);
}

/** The wait of a status, or `null` for one that works or is final. */
export function waitOf(status: ImprovementStatus): ImprovementWait | null {
  return WAITS[status] ?? null;
}

/** Whether the transition table lets a status become another. */
export function canMove(
  from: ImprovementStatus,
  to: ImprovementStatus,
): boolean {
  const ends = ENDINGS.includes(to) && !isFinal(from);
  return ends || NEXT[from].includes(to);
}
