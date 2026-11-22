import type {
  ErrorBody,
  ErrorCode,
} from '@coverage-autopilot/api-contracts/errors';

import type { ServiceAnswer } from '#api/service-api';
import { type CommandIo, EXIT_CODE } from '#commands/command-io';

/** The lines a person reads of a value. */
export type LinesOf<Value> = (value: Value) => readonly string[];

/** Why a job ended in failure, as the service answers it. */
interface Failure {
  readonly reason: ErrorCode;
  readonly message: string;
}

/**
 * Prints the result on standard output: with `--json` the value of the
 * contract as one document, else its lines for people.
 */
export function printResult<Value>(
  value: Value,
  linesOf: LinesOf<Value>,
  io: CommandIo,
): number {
  const lines = io.json ? [JSON.stringify(value)] : linesOf(value);
  for (const line of lines) {
    io.out(line);
  }
  return EXIT_CODE.done;
}

/**
 * Says a refusal in the shape the service uses, on standard error, since
 * it is a diagnostic and not a result, and fails the command.
 */
export function printRefusal(error: ErrorBody, io: CommandIo): number {
  io.err(JSON.stringify(error));
  return EXIT_CODE.failed;
}

/** Prints what the service answered: its value as the result, or its refusal. */
export function printAnswer<Value>(
  answer: ServiceAnswer<Value>,
  linesOf: LinesOf<Value>,
  io: CommandIo,
): number {
  return answer.outcome === 'answered'
    ? printResult(answer.value, linesOf, io)
    : printRefusal(answer.error, io);
}

/** The value the service answered, or nothing once its refusal was said. */
export function answeredValue<Value>(
  answer: ServiceAnswer<Value>,
  io: CommandIo,
): Value | undefined {
  if (answer.outcome === 'answered') {
    return answer.value;
  }
  printRefusal(answer.error, io);
  return undefined;
}

/**
 * Says a failed job in the shape of a refusal, since its reason is an
 * error code too, and fails the command. A job with no reason is said in
 * one word rather than in a made-up code.
 */
export function printFailure(failure: Failure | null, io: CommandIo): number {
  if (failure === null) {
    io.err('failed');
    return EXIT_CODE.failed;
  }
  return printRefusal({ error: failure.reason, message: failure.message }, io);
}
