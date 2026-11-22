import type { ImprovementPatch } from '@coverage-autopilot/api-contracts/improvements';

import { labelled } from '#commands/columns';
import type { Command } from '#commands/command';
import type { CommandIo } from '#commands/command-io';
import { printAnswer } from '#commands/output';

/**
 * The hash first and then the diff: `git apply` skips the text before the
 * first header of a diff, so the output still applies as it is.
 */
function patchLines(patch: ImprovementPatch): string[] {
  return [
    labelled('hash', patch.patchHash),
    ...patch.patch.replace(/\n$/u, '').split('\n'),
  ];
}

/** `patch <id>`: the test patch of an improvement and its hash. */
export async function patch(
  command: Command<'patch'>,
  io: CommandIo,
): Promise<number> {
  const answer = await io.session.api.getImprovementPatch(command.id);
  return printAnswer(answer, patchLines, io);
}
