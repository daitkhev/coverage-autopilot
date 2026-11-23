import { alignedRows } from '#commands/columns';
import type { Command } from '#commands/command';
import type { CommandIo } from '#commands/command-io';
import { improvementCells } from '#commands/improvement-words';
import { printAnswer } from '#commands/output';

/**
 * `approve <id> --hash <hash>`: approves the patch a person saw, named by
 * its hash, and prints the improvement. The service refuses another hash.
 */
export async function approve(
  command: Command<'approve'>,
  io: CommandIo,
): Promise<number> {
  const answer = await io.session.api.approveImprovement(command.id, {
    patchHash: command.hash,
  });
  return printAnswer(
    answer,
    (value) => alignedRows([improvementCells(value, io)]),
    io,
  );
}
