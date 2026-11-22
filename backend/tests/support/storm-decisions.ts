import { errorSchema } from '@coverage-autopilot/api-contracts/errors';
import {
  type Improvement,
  improvementPatchSchema,
  improvementSchema,
} from '@coverage-autopilot/api-contracts/improvements';
import type {
  ImprovementMode,
  ImprovementStatus,
} from '@coverage-autopilot/api-contracts/statuses';

import {
  ACCEPTED,
  type Answer,
  CONFLICT,
  OK,
} from '#tests/support/contract-ledger';
import { isFinal } from '#tests/support/designed-moves';
import type { OnLook } from '#tests/support/improvement-watch';
import { choicesOf, send, type Storm } from '#tests/support/storm';
import type { Winner } from '#tests/support/storm-requests';

/** The statuses an improvement passes in each mode, in order. */
const PATHS: Readonly<Record<ImprovementMode, readonly ImprovementStatus[]>> = {
  automatic: ['created', 'analyzing', 'generating', 'verifying', 'publishing'],
  review: [
    'created',
    'analyzing',
    'generating',
    'verifying',
    'awaiting_approval',
  ],
};

/** Every cancel sent for one improvement in a run, and what it was answered. */
export interface CancelLog {
  readonly answers: Answer[];
}

/** An approval as it was sent, and its answer. */
interface Approval {
  readonly right: boolean;
  readonly answer: Answer;
}

/** What one approval burst sent. */
export interface Decision {
  readonly approvals: readonly Approval[];
  /** Whether cancels were sent before the approvals or with them. */
  readonly cancelled: boolean;
}

/** Several cancels at once, as a person who presses twice and a script would. */
async function cancelsAtOnce(storm: Storm, id: string): Promise<Answer[]> {
  return Promise.all(
    Array.from({ length: storm.sizes.cancelsAtOnce }, async () =>
      send(storm, `/improvements/${id}/cancel`, { method: 'POST', body: {} }),
    ),
  );
}

/**
 * The look that cancels an improvement once it is seen at a status of
 * chance or past it, or never. The moment within the status is the
 * scheduler's, so the cancel meets the worker anywhere in a step.
 */
export function cancelOnLook(
  storm: Storm,
  winner: Winner,
  log: CancelLog,
): OnLook {
  const random = choicesOf(storm, `cancel:${winner.target.label}`);
  const path = PATHS[winner.target.mode];
  const at = random.chance(storm.sizes.cancelChance)
    ? path.indexOf(random.pick(path))
    : null;
  return async (improvement) => {
    const place = path.indexOf(improvement.status);
    const due = place === -1 || (at !== null && place >= at);
    if (at === null || !due || log.answers.length > 0) {
      return;
    }
    log.answers.push(...(await cancelsAtOnce(storm, winner.id)));
  };
}

/** A hash of the same form that names no patch of the improvement. */
function otherHash(hash: string): string {
  return `${hash.slice(0, -1)}${hash.endsWith('0') ? '1' : '0'}`;
}

/**
 * Approvals at once, some of a patch the person never saw, and now and
 * then cancels in the same burst, for an improvement that waits for one.
 */
export async function decidedAtOnce(
  storm: Storm,
  winner: Winner,
  log: CancelLog,
): Promise<Decision> {
  const random = choicesOf(storm, `approve:${winner.target.label}`);
  // A cancel at the look that found it waiting may have ended it already,
  // and then no approval can win.
  const cancelledBefore = log.answers.length > 0;
  const patch = improvementPatchSchema.parse(
    (await send(storm, `/improvements/${winner.id}/patch`)).body,
  );
  const rights = Array.from(
    { length: storm.sizes.approvalsAtOnce },
    () => !random.chance(storm.sizes.wrongHashChance),
  );
  const cancelled = random.chance(storm.sizes.cancelChance);
  const approving = Promise.all(
    rights.map(async (right) => ({
      right,
      answer: await send(storm, `/improvements/${winner.id}/approve`, {
        method: 'POST',
        body: {
          patchHash: right ? patch.patchHash : otherHash(patch.patchHash),
        },
      }),
    })),
  );
  const cancelling = cancelled
    ? cancelsAtOnce(storm, winner.id)
    : Promise.resolve([]);
  const [approvals, cancels] = await Promise.all([approving, cancelling]);
  log.answers.push(...cancels);
  return { approvals, cancelled: cancelledBefore || cancelled };
}

/** How one approval breaks the rules: only the patch the person saw is approved, once. */
function approvalBreach(approval: Approval): string | null {
  const { answer, right } = approval;
  if (answer.status === ACCEPTED) {
    return right ? null : 'approved a patch nobody saw';
  }
  if (answer.status !== CONFLICT) {
    return `was answered ${String(answer.status)}`;
  }
  const code = errorSchema.parse(answer.body).error;
  const allowed = right
    ? ['status_conflict']
    : ['status_conflict', 'patch_hash_mismatch'];
  return allowed.includes(code) ? null : `was refused with ${code}`;
}

/**
 * One approval wins, unless a cancel came first. An approval that won
 * publishes, unless a cancel came after it, and a cancel that won ends the
 * improvement cancelled.
 */
export function decisionFindings(
  winner: Winner,
  decision: Decision,
  last: Improvement,
): string[] {
  const won = decision.approvals.filter(
    ({ answer }) => answer.status === ACCEPTED,
  ).length;
  const findings = decision.approvals.flatMap((approval) => {
    const breach = approvalBreach(approval);
    return breach === null
      ? []
      : [`An approval of ${winner.target.label} ${breach}.`];
  });
  if (won > 1 || (won === 0 && !decision.cancelled)) {
    findings.push(`${String(won)} approvals of ${winner.target.label} won.`);
  }
  if (won === 0 && last.status !== 'cancelled') {
    findings.push(
      `No approval of ${winner.target.label} won, and it ended ${last.status}.`,
    );
  }
  return findings;
}

/**
 * At most one cancel of an improvement ends it, and that one is the end:
 * it ends cancelled, with no pull request, and a cancel that found it
 * over found it final.
 */
export function cancelFindings(
  winner: Winner,
  log: CancelLog,
  last: Improvement,
): string[] {
  const label = winner.target.label;
  const answered = log.answers.flatMap((answer) =>
    answer.status === ACCEPTED || answer.status === OK
      ? [
          {
            status: answer.status,
            improvement: improvementSchema.parse(answer.body),
          },
        ]
      : [],
  );
  const findings = log.answers
    .filter((answer) => answer.status !== ACCEPTED && answer.status !== OK)
    .map(
      (answer) => `A cancel of ${label} was answered ${String(answer.status)}.`,
    );
  const won = answered.filter(({ status }) => status === ACCEPTED);
  if (won.length !== (last.status === 'cancelled' ? 1 : 0)) {
    findings.push(
      `${String(won.length)} cancels of ${label} ended it, and it ended ${last.status}.`,
    );
  }
  for (const { improvement } of answered) {
    if (!isFinal(improvement.status)) {
      findings.push(`A cancel of ${label} answered it ${improvement.status}.`);
    }
  }
  if (
    last.status === 'cancelled' &&
    (last.pullRequest !== null || last.cancelledAt === null)
  ) {
    findings.push(
      `${label} was cancelled with ${JSON.stringify(last.pullRequest)} at ${String(last.cancelledAt)}.`,
    );
  }
  return findings;
}
