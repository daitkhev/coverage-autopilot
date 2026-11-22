import {
  type ErrorCode,
  errorSchema,
} from '@coverage-autopilot/api-contracts/errors';
import { improvementSchema } from '@coverage-autopilot/api-contracts/improvements';
import type { ImprovementMode } from '@coverage-autopilot/api-contracts/statuses';

import {
  ACCEPTED,
  type Answer,
  CONFLICT,
  OK,
} from '#tests/support/contract-ledger';
import { TARGET } from '#tests/support/mutation-reports';
import { choicesOf, send, type Storm } from '#tests/support/storm';
import { COVERED } from '#tests/support/widgets-project';

/** The target can be covered more. The other file is covered whole. */
const FILES = [TARGET, COVERED] as const;

const MODES: readonly ImprovementMode[] = ['automatic', 'review'];

/** One file of one repository, from the snapshot of a round. */
interface Target {
  /** Its place among the targets of its round, for the keys of its requests. */
  readonly index: number;
  readonly fullName: string;
  readonly file: string;
  readonly snapshotId: string;
  readonly mode: ImprovementMode;
  /** The repository and the file, to name the target in a choice or a finding. */
  readonly label: string;
}

/** One request for an improvement of a target. */
export interface Contender {
  readonly target: Target;
  readonly key: string;
  /** A model of its own makes other work of the same file. */
  readonly model: string;
}

/** The request whose improvement holds its target. */
export interface Winner extends Contender {
  readonly id: string;
}

interface Sent extends Contender {
  readonly answer: Answer;
}

/** What a burst of requests left: what broke, and the improvement of each target. */
export interface RequestRound {
  readonly findings: string[];
  readonly winners: Winner[];
}

/** The body of a request, in the mode of its target unless another is given. */
function bodyOf(
  contender: Contender,
  mode: ImprovementMode = contender.target.mode,
): Record<string, unknown> {
  return {
    snapshotId: contender.target.snapshotId,
    filePath: contender.target.file,
    mode,
    generator: { cli: 'claude_code', model: contender.model },
  };
}

export async function requested(
  storm: Storm,
  contender: Contender,
  mode?: ImprovementMode,
): Promise<Answer> {
  return send(storm, '/improvements', {
    method: 'POST',
    headers: { 'Idempotency-Key': contender.key },
    body: bodyOf(contender, mode),
  });
}

/** Both files of every repository, from the snapshot its round made. */
function targetsOf(
  storm: Storm,
  snapshots: ReadonlyMap<string, string>,
  round: number,
): Target[] {
  return storm.repositories.flatMap((fullName, place) => {
    const snapshotId = snapshots.get(fullName);
    if (snapshotId === undefined) {
      throw new Error(`${fullName} has no snapshot of round ${String(round)}.`);
    }
    return FILES.map((file, kind) => {
      const label = `${fullName}:${file}:r${String(round)}`;
      const mode =
        file === TARGET
          ? choicesOf(storm, `mode:${label}`).pick(MODES)
          : 'automatic';
      return {
        index: place * FILES.length + kind,
        fullName,
        file,
        snapshotId,
        mode,
        label,
      };
    });
  });
}

/** Many requests for one target and a few for each other, under a few keys and two models. */
function contendersOf(
  storm: Storm,
  snapshots: ReadonlyMap<string, string>,
  round: number,
): Contender[] {
  const random = choicesOf(storm, `requests:${String(round)}`);
  const targets = targetsOf(storm, snapshots, round);
  const focus = random.below(targets.length);
  const models = ['sonnet', 'opus'].map((name) => `${name}-r${String(round)}`);
  const { atOnce, spread, requestKeys } = storm.sizes;
  return random.shuffled(
    targets.flatMap((target) =>
      Array.from({ length: target.index === focus ? atOnce : spread }, () => ({
        target,
        key: `improve-${String(target.index)}-r${String(round)}-${String(random.below(requestKeys))}`,
        model: random.pick(models),
      })),
    ),
  );
}

/** The conflict a request meets once another improvement holds its file. */
function conflictWith(contender: Contender, winner: Contender): ErrorCode {
  if (contender.key === winner.key) {
    return 'request_key_reused';
  }
  return contender.model === winner.model
    ? 'work_already_requested'
    : 'improvement_in_progress';
}

/** How one answer of a burst breaks the rules, given the improvement that won. */
function answerBreach(sent: Sent, winner: Winner): string | null {
  const { answer } = sent;
  if (answer.status === OK) {
    const same = sent.key === winner.key && sent.model === winner.model;
    return same && improvementSchema.parse(answer.body).id === winner.id
      ? null
      : 'found another improvement';
  }
  if (answer.status !== CONFLICT) {
    return 'is neither the existing improvement nor a conflict';
  }
  const refusal = errorSchema.parse(answer.body);
  const expected = conflictWith(sent, winner);
  return refusal.error === expected && refusal.improvementId === winner.id
    ? null
    : `was not ${expected} with ${winner.id}`;
}

/**
 * One improvement holds a file: exactly one request made it, a request
 * with its key and its work found it, and every other one was the
 * conflict the table of the two keys gives, naming it.
 */
function targetFindings(
  target: Target,
  sent: readonly Sent[],
): { findings: string[]; winner: Winner | null } {
  const creations = sent.filter(({ answer }) => answer.status === ACCEPTED);
  const [first] = creations;
  if (creations.length !== 1 || first === undefined) {
    return {
      findings: [
        `${String(creations.length)} improvements were made of ${target.label}.`,
      ],
      winner: null,
    };
  }
  const made = improvementSchema.parse(first.answer.body);
  const winner = { ...first, id: made.id };
  const asked = [target.file, target.mode, first.model].join();
  const given = [made.targetFile, made.mode, made.generator.model].join();
  const findings = sent
    .filter((one) => one !== first)
    .flatMap((one) => {
      const breach = answerBreach(one, winner);
      return breach === null
        ? []
        : [
            `A request of ${target.label} with ${one.key} and ${one.model} ` +
              `${breach}: ${String(one.answer.status)} ` +
              JSON.stringify(one.answer.body),
          ];
    });
  if (asked !== given) {
    findings.push(
      `${target.label} was asked as ${asked} and made as ${given}.`,
    );
  }
  return { findings, winner };
}

/**
 * Asks for improvements of both files of every repository many times at
 * once, under a few keys and two models each, and gives what broke the
 * rule of one live improvement per file, with the improvement of each.
 */
export async function requestedAtOnce(
  storm: Storm,
  round: {
    readonly number: number;
    readonly snapshots: ReadonlyMap<string, string>;
  },
): Promise<RequestRound> {
  const contenders = contendersOf(storm, round.snapshots, round.number);
  const sent = await Promise.all(
    contenders.map(async (contender) => ({
      ...contender,
      answer: await requested(storm, contender),
    })),
  );
  const results = [...new Set(contenders.map(({ target }) => target))].map(
    (target) =>
      targetFindings(
        target,
        sent.filter((one) => one.target === target),
      ),
  );
  const winners = results.flatMap(({ winner }) =>
    winner === null ? [] : [winner],
  );
  storm.known.improvements.push(...winners.map(({ id }) => id));
  return { findings: results.flatMap(({ findings }) => findings), winners };
}
