import { errorSchema } from '@coverage-autopilot/api-contracts/errors';
import {
  type Improvement,
  improvementSchema,
} from '@coverage-autopilot/api-contracts/improvements';

import {
  ACCEPTED,
  type Answer,
  CONFLICT,
  OK,
} from '#tests/support/contract-ledger';
import type { Storm } from '#tests/support/storm';
import {
  type Contender,
  requested,
  type Winner,
} from '#tests/support/storm-requests';

/** An improvement of a round, as it ended. */
export interface Ended {
  readonly winner: Winner;
  readonly last: Improvement;
}

/**
 * `same`: the key and the work of the improvement. `reused`: its key for
 * other work. `fresh`: its work under a key never used.
 */
type Kind = 'same' | 'reused' | 'fresh';

interface Ask {
  readonly kind: Kind;
  readonly contender: Contender;
}

interface Sent extends Ask {
  readonly answer: Answer;
}

/** What asking again left: what broke, and the improvements it made. */
export interface AgainRound {
  readonly findings: string[];
  readonly renewed: Winner[];
}

/** The same work twice by its key, once its key for other work, and its work under fresh keys. */
function asksOf(storm: Storm, ended: Ended, round: number): Ask[] {
  const { winner } = ended;
  const fresh = Array.from({ length: storm.sizes.freshKeys }, (_, number) => ({
    kind: 'fresh' as const,
    contender: {
      ...winner,
      key: `again-${String(winner.target.index)}-r${String(round)}-${String(number)}`,
    },
  }));
  return [
    { kind: 'same', contender: winner },
    { kind: 'same', contender: winner },
    {
      kind: 'reused',
      contender: { ...winner, model: `${winner.model}-other` },
    },
    ...fresh,
  ];
}

/**
 * Work under a fresh key runs from start to end, so a file whose
 * improvement waited for a person is asked again in automatic mode, which
 * is no part of the work.
 */
async function sentAgain(
  storm: Storm,
  ended: Ended,
  round: number,
): Promise<Sent[]> {
  return Promise.all(
    asksOf(storm, ended, round).map(async (ask) => ({
      ...ask,
      answer: await requested(
        storm,
        ask.contender,
        ask.kind === 'fresh' ? 'automatic' : undefined,
      ),
    })),
  );
}

/** An answer in a few words: its status, its code and the improvement it names. */
function told(answer: Answer): string {
  if (answer.status === OK || answer.status === ACCEPTED) {
    return `${String(answer.status)} ${improvementSchema.parse(answer.body).id}`;
  }
  if (answer.status !== CONFLICT) {
    return `${String(answer.status)} ${JSON.stringify(answer.body)}`;
  }
  const refusal = errorSchema.parse(answer.body);
  return `${String(CONFLICT)} ${refusal.error} ${String(refusal.improvementId)}`;
}

/** What the table of the two keys gives a request, once `holder` holds the work. */
function expectedOf(kind: Kind, winner: Winner, holder: string): string {
  switch (kind) {
    case 'same':
      return `${String(OK)} ${winner.id}`;
    case 'reused':
      return `${String(CONFLICT)} request_key_reused ${winner.id}`;
    case 'fresh':
      return `${String(CONFLICT)} work_already_requested ${holder}`;
  }
}

/**
 * The table of the two keys: the same key and work give the improvement
 * made before, whatever its status; the same key for other work is a
 * conflict; the same work under another key is a conflict while it is
 * active or done, and one new improvement once it failed or was
 * cancelled, which the other fresh keys then meet.
 */
function againFindings(ended: Ended, sent: readonly Sent[]): AgainRound {
  const { winner, last } = ended;
  const open = last.status === 'failed' || last.status === 'cancelled';
  const made = sent.filter(({ answer }) => answer.status === ACCEPTED);
  const renewed = made.map(({ contender, answer }) => ({
    ...contender,
    id: improvementSchema.parse(answer.body).id,
  }));
  const holder = open ? (renewed[0]?.id ?? 'none') : winner.id;
  const findings = sent
    .filter((one) => one.answer.status !== ACCEPTED || one !== made[0])
    .filter((one) => told(one.answer) !== expectedOf(one.kind, winner, holder))
    .map(
      (one) =>
        `Asked again (${one.kind}), ${winner.target.label}, which ended ` +
        `${last.status}, was answered ${told(one.answer)}.`,
    );
  if (made.length !== (open ? 1 : 0)) {
    findings.push(
      `Asked again, ${winner.target.label}, which ended ${last.status}, ` +
        `made ${String(made.length)} improvements.`,
    );
  }
  return { findings, renewed };
}

/**
 * Asks again, all at once, for the work of every improvement of a round
 * that ended, and gives what broke the table of the two keys, with the
 * improvements made of files whose improvement had been cancelled.
 */
export async function requestedAgain(
  storm: Storm,
  endings: readonly Ended[],
  round: number,
): Promise<AgainRound> {
  const sent = await Promise.all(
    endings.map(async (ended) => sentAgain(storm, ended, round)),
  );
  const results = endings.map((ended, index) =>
    againFindings(ended, sent[index] ?? []),
  );
  const renewed = results.flatMap((result) => result.renewed);
  storm.known.improvements.push(...renewed.map(({ id }) => id));
  return { findings: results.flatMap((result) => result.findings), renewed };
}
