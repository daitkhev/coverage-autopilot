import type {
  AccessCheck,
  AccessStep,
} from '@coverage-autopilot/api-contracts/repositories';

import { alignedRow, type Cells, columnWidths } from '#commands/columns';
import type { Command } from '#commands/command';
import { type CommandIo, EXIT_CODE } from '#commands/command-io';
import { answeredValue, printResult } from '#commands/output';
import { findRepository } from '#commands/repository-lookup';
import { statusText, symbolText } from '#commands/words';
import { ACCESS_CHECK_STATUS } from '#theme/status';

function stepCells(step: AccessStep, io: CommandIo): Cells {
  return [
    statusText(ACCESS_CHECK_STATUS[step.status], io),
    step.name,
    step.message ?? '',
  ];
}

/**
 * What the tool that refused answered, under its step, so a person can
 * act on it. Its first line hangs on the result symbol.
 */
function toolLines(step: AccessStep, io: CommandIo): string[] {
  const result = symbolText('result', io);
  return (step.toolOutput ?? '')
    .split('\n')
    .filter((line) => line !== '')
    .map((line, index) => `${index === 0 ? `  ${result}` : '   '} ${line}`);
}

function accessLines(check: AccessCheck, io: CommandIo): string[] {
  const widths = columnWidths(check.steps.map((step) => stepCells(step, io)));
  return check.steps.flatMap((step) => [
    alignedRow(stepCells(step, io), widths),
    ...toolLines(step, io),
  ]);
}

/**
 * `repo check <repo>`: runs the access check and prints every step. A
 * check that failed fails the command, so a script can stop on it.
 */
export async function repoCheck(
  command: Command<'repo check'>,
  io: CommandIo,
): Promise<number> {
  const repository = await findRepository(command.repository, io);
  if (repository === undefined) {
    return EXIT_CODE.failed;
  }
  const check = answeredValue(
    await io.session.api.checkAccess(repository.id),
    io,
  );
  if (check === undefined) {
    return EXIT_CODE.failed;
  }
  printResult(check, (value) => accessLines(value, io), io);
  return check.passed ? EXIT_CODE.done : EXIT_CODE.failed;
}
