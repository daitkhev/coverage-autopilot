import type { ServiceAnswer } from '#api/service-api';
import { alignedRows } from '#commands/columns';
import type { Command } from '#commands/command';
import type { CommandIo } from '#commands/command-io';
import { improvementCells } from '#commands/improvement-words';
import { printAnswer } from '#commands/output';
import { scanCells } from '#commands/scan-words';

function isNotFound(answer: ServiceAnswer<unknown>): boolean {
  return answer.outcome === 'refused' && answer.error.error === 'not_found';
}

/**
 * `cancel <id>`: cancels the improvement with that id, or else the scan
 * with it, and prints the new status. Work that had ended stays as it was.
 */
export async function cancel(
  command: Command<'cancel'>,
  io: CommandIo,
): Promise<number> {
  const { api } = io.session;
  const improvement = await api.cancelImprovement(command.id);
  if (!isNotFound(improvement)) {
    return printAnswer(
      improvement,
      (value) => alignedRows([improvementCells(value, io)]),
      io,
    );
  }
  return printAnswer(
    await api.cancelScan(command.id),
    (value) => alignedRows([scanCells(value, io)]),
    io,
  );
}
