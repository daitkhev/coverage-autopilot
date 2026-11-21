import { isAbsolute } from 'node:path';

import { InvalidSandboxRequestError } from '#infrastructure/sandbox/errors/invalid-sandbox-request.error';
import type { SandboxCommandRequest } from '#ports/sandbox.port';

/** A name of a variable as a shell and the engine's file of variables read it. */
const VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** A line break would end the line of the file the engine reads. */
const LINE_BREAK = /[\r\n\0]/;

/** The engine splits the value of `--mount` at commas, and quotes change that. */
const NOT_MOUNTABLE = /[,"\r\n\0]/;

/** The longest wait a timer of Node holds. A longer one fires at once. */
const LONGEST_TIMEOUT_MS = 2_147_483_647;

function pathProblems(path: string): string[] {
  return isAbsolute(path) && !NOT_MOUNTABLE.test(path)
    ? []
    : [
        'The working copy is not an absolute path without a comma, a quote ' +
          'or a line break.',
      ];
}

function commandProblems(command: readonly string[]): string[] {
  return command.length > 0 ? [] : ['The command names no program.'];
}

function timeoutProblems(timeoutMs: number): string[] {
  return Number.isInteger(timeoutMs) &&
    timeoutMs > 0 &&
    timeoutMs <= LONGEST_TIMEOUT_MS
    ? []
    : [
        'The time limit is not a whole number of milliseconds from 1 to ' +
          `${String(LONGEST_TIMEOUT_MS)}.`,
      ];
}

/** A value may be a secret, so a problem names the variable alone. */
function variableProblems([name, value]: [string, string]): string[] {
  if (!VARIABLE_NAME.test(name)) {
    return [`"${name}" is not a name of a variable.`];
  }
  return LINE_BREAK.test(value)
    ? [`The value of ${name} holds a line break or a NUL.`]
    : [];
}

/** Refuses a request the engine would read in another way than it means. */
export function checkRequest(request: SandboxCommandRequest): void {
  const problems = [
    ...pathProblems(request.workingCopyPath),
    ...commandProblems(request.command),
    ...timeoutProblems(request.timeoutMs),
    ...Object.entries(request.environment).flatMap(variableProblems),
  ];
  if (problems.length > 0) {
    throw new InvalidSandboxRequestError(problems.join(' '));
  }
}

/**
 * The variables of the command, one `NAME=value` a line, as the engine
 * reads them with `--env-file`. They go to the engine on its standard
 * input, so no value is in a list of arguments that `ps` shows.
 */
export function environmentFile(
  environment: SandboxCommandRequest['environment'],
): string {
  return Object.entries(environment)
    .map(([name, value]) => `${name}=${value}\n`)
    .join('');
}
