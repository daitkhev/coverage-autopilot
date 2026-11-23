import type { Improvement } from '@coverage-autopilot/api-contracts/improvements';

import { labelled } from '#commands/columns';
import type { Command } from '#commands/command';
import type { CommandIo } from '#commands/command-io';
import { attemptLine, statusWords } from '#commands/improvement-words';
import { printAnswer } from '#commands/output';
import { countWords } from '#theme/counts';
import { durationWords } from '#theme/moments';

const SECOND_MS = 1000;

/** What the improvement spent of its budget. Tokens may have no limit. */
function budgetLines(improvement: Improvement): string[] {
  const { budget, usage } = improvement;
  const tokenLimit =
    budget.tokens === null ? '' : ` of ${String(budget.tokens)}`;
  return [
    labelled(
      'attempts',
      `${String(usage.attempts)} of ${String(budget.attempts)}`,
    ),
    labelled('tokens', `${String(usage.tokens)}${tokenLimit}`),
    labelled(
      'time',
      `${durationWords(usage.seconds * SECOND_MS)} of ${countWords(budget.minutes, 'minute')}`,
    ),
  ];
}

function statusLines(improvement: Improvement, io: CommandIo): string[] {
  return [
    labelled('improvement', improvement.id),
    labelled('file', improvement.targetFile),
    labelled('status', statusWords(improvement, io)),
    labelled('mode', improvement.mode),
    ...improvement.attempts.map(attemptLine),
    ...budgetLines(improvement),
  ];
}

/**
 * `status <id>`: one improvement, with its status and what stands beside
 * it, which holds the pull request or the reason, every attempt, and the
 * budget it spent.
 */
export async function status(
  command: Command<'status'>,
  io: CommandIo,
): Promise<number> {
  const answer = await io.session.api.getImprovement(command.id);
  return printAnswer(answer, (value) => statusLines(value, io), io);
}
