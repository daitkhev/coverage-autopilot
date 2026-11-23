import type { ServiceAnswer } from '#api/service-api';
import { type CommandIo, EXIT_CODE } from '#commands/command-io';
import {
  answeredValue,
  type LinesOf,
  printAnswer,
  printRefusal,
} from '#commands/output';

/** About once a second, as the screen of an improvement asks. */
const WAIT_INTERVAL_MS = 1000;

/** How the wait ends at a final status: what it prints, and its exit code. */
export type Ending<Work> = (
  work: Work,
  io: CommandIo,
) => number | Promise<number>;

/** What `--wait` needs to know of one kind of work. */
interface Watch<Work> {
  /** Asks the service about the work again. */
  readonly ask: (work: Work) => Promise<ServiceAnswer<Work>>;
  /** What the work says of itself now, one line for each thing that moves. */
  readonly linesOf: (work: Work) => readonly string[];
  /** The ending of a final status, and none while the work goes on. */
  readonly endingOf: (work: Work) => Ending<Work> | undefined;
}

/** How a command that started work reports it. */
interface Report<Work> {
  /** `--wait`: follow the work to its end. */
  readonly wait: boolean;
  /** The lines of the work as the service answered the start. */
  readonly linesOf: LinesOf<Work>;
  readonly watch: Watch<Work>;
}

/**
 * Cancelled work has no result and no reason, so one word says that it
 * ended, and the command fails.
 */
export function endCancelled(_work: unknown, io: CommandIo): number {
  io.err('cancelled');
  return EXIT_CODE.failed;
}

/** Says on standard error each line that the last answer did not say. */
function sayChanges(
  lines: readonly string[],
  before: readonly string[],
  io: CommandIo,
): readonly string[] {
  for (const line of lines) {
    if (!before.includes(line)) {
      io.err(line);
    }
  }
  return lines;
}

/**
 * Asks about the work until it is final, says each change as one plain
 * line, and ends the way its final status ends. A refusal on the way
 * ends the wait with that refusal.
 */
async function waitForEnd<Work>(
  first: Work,
  watch: Watch<Work>,
  io: CommandIo,
): Promise<number> {
  let work = first;
  let said = sayChanges(watch.linesOf(work), [], io);
  let ending = watch.endingOf(work);
  while (ending === undefined) {
    await io.pause(WAIT_INTERVAL_MS);
    const answer = await watch.ask(work);
    if (answer.outcome === 'refused') {
      return printRefusal(answer.error, io);
    }
    work = answer.value;
    said = sayChanges(watch.linesOf(work), said, io);
    ending = watch.endingOf(work);
  }
  return ending(work, io);
}

/**
 * Reports the answer to a request that started work: the work as it is,
 * or with `--wait` the work followed to its end.
 */
export async function reportStart<Work>(
  answer: ServiceAnswer<Work>,
  report: Report<Work>,
  io: CommandIo,
): Promise<number> {
  if (!report.wait) {
    return printAnswer(answer, report.linesOf, io);
  }
  const started = answeredValue(answer, io);
  return started === undefined
    ? EXIT_CODE.failed
    : waitForEnd(started, report.watch, io);
}
