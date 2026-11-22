import type { CommandIo } from '#commands/command-io';
import { answeredValue } from '#commands/output';
import { accessLines, destinationLine } from '#commands/repo-check';

/**
 * The access check before work starts, which says on standard error where
 * a result goes. A check that did not pass starts nothing: its steps are
 * said, as `repo check` prints them, and so is a refusal of the service.
 */
export async function accessPassed(
  repositoryId: string,
  io: CommandIo,
): Promise<boolean> {
  const check = answeredValue(
    await io.session.api.checkAccess(repositoryId),
    io,
  );
  if (check === undefined) {
    return false;
  }
  const { destination } = check;
  if (!check.passed || destination === null) {
    for (const line of accessLines(check, io)) {
      io.err(line);
    }
    return false;
  }
  io.err(destinationLine(destination));
  return true;
}
