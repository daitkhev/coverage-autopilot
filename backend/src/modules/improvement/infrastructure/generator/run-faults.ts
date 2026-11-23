import { GeneratorCliMissingError } from '#improvement/infrastructure/errors/generator-cli-missing.error';
import { GeneratorFailedError } from '#improvement/infrastructure/errors/generator-failed.error';
import { GeneratorLoginFailedError } from '#improvement/infrastructure/errors/generator-login-failed.error';
import { GeneratorOutputTruncatedError } from '#improvement/infrastructure/errors/generator-output-truncated.error';
import { GeneratorOutputUnreadableError } from '#improvement/infrastructure/errors/generator-output-unreadable.error';
import { GeneratorUnsafeStartError } from '#improvement/infrastructure/errors/generator-unsafe-start.error';
import type {
  InitEvent,
  ResultEvent,
} from '#improvement/infrastructure/generator/claude-stream.schema';
import { shortText } from '#improvement/infrastructure/generator/credential-text';
import type {
  FinishedRun,
  RunRules,
} from '#improvement/infrastructure/generator/finished-run';

/** The exit code of a program that was found and could not be run. */
const NOT_EXECUTABLE = 126;

/** The exit code of a program that is not there. */
const NOT_FOUND = 127;

const NOT_RUNNABLE: ReadonlySet<number | null> = new Set([
  NOT_EXECUTABLE,
  NOT_FOUND,
]);

const LINE_BREAK = '\n';

/** The error the CLI gives an answer when its credential is refused. */
const LOGIN_REFUSED = 'authentication_failed';

/**
 * What the CLI is assumed to print when it has no working login. No
 * failed login was measured, so this is a guess from its messages.
 */
const LOGIN_TEXT =
  /invalid api key|please run \/login|not logged in|oauth token has expired|authentication_error|failed to authenticate/iu;

const MOST_TOOLS = 20;
const MOST_TOOL_CHARACTERS = 80;
const MOST_SAID_CHARACTERS = 300;

function sameTools(
  listed: readonly string[],
  allowed: readonly string[],
): boolean {
  const order = (tools: readonly string[]): string =>
    [...tools].sort().join(LINE_BREAK);
  return order(listed) === order(allowed);
}

function isSafe(init: InitEvent, rules: RunRules): boolean {
  return (
    init.mcp_servers.length === 0 && sameTools(init.tools, rules.allowedTools)
  );
}

function rawOutput(run: FinishedRun): string {
  return `Raw output: ${run.outputReference}.`;
}

function toolList(tools: readonly string[], rules: RunRules): string {
  const named = tools
    .slice(0, MOST_TOOLS)
    .map((tool) =>
      shortText(tool, rules.credential.value, MOST_TOOL_CHARACTERS),
    );
  return `[${named.join(', ')}]`;
}

/** What the CLI said, fit for a message. */
function said(text: string, rules: RunRules): string {
  return shortText(text, rules.credential.value, MOST_SAID_CHARACTERS);
}

/** Whether the CLI said its credential was refused, in an event or in text. */
function loginRefused(run: FinishedRun, failure: string): boolean {
  return (
    run.stream.answerErrors.has(LOGIN_REFUSED) ||
    LOGIN_TEXT.test(`${failure}${LINE_BREAK}${run.stream.plainText}`)
  );
}

function loginFault(run: FinishedRun, rules: RunRules): Error {
  return new GeneratorLoginFailedError(
    `The CLI could not log in with ${rules.credential.variable}. ${rawOutput(run)}`,
  );
}

/** The texts a failed result carries, which the CLI does not name alike. */
function failureTextOf(result: ResultEvent): string {
  return [result.result, ...result.errors]
    .filter((text) => text !== '')
    .join(LINE_BREAK);
}

/**
 * The sandbox port runs a command to its end, so the start report is read
 * after the run and not before the first call of the model. A start with
 * other tools or with a tool server is refused here, and what the run
 * wrote must not be used.
 */
export function unsafeStartFault(
  run: FinishedRun,
  rules: RunRules,
): Error | null {
  const unsafe = run.stream.inits.find((init) => !isSafe(init, rules));
  if (unsafe === undefined) {
    return null;
  }
  return new GeneratorUnsafeStartError(
    `The CLI started with the tools ${toolList(unsafe.tools, rules)} and ` +
      `${String(unsafe.mcp_servers.length)} tool servers, where exactly ` +
      `${toolList(rules.allowedTools, rules)} and none are allowed. What ` +
      `it wrote must not be used. ${rawOutput(run)}`,
  );
}

export function unreadableFault(run: FinishedRun): Error | null {
  const kinds = [...new Set(run.stream.unreadable)];
  return kinds.length === 0
    ? null
    : new GeneratorOutputUnreadableError(
        `The CLI printed ${kinds.join(', ')} in a shape the adapter does ` +
          `not read. ${rawOutput(run)}`,
      );
}

/** Why a run that printed no start report did not start the CLI. */
export function missingStartFault(run: FinishedRun, rules: RunRules): Error {
  const { exitCode, outputTruncated } = run.ended;
  if (outputTruncated) {
    return new GeneratorOutputTruncatedError(
      'The sandbox kept only the end of the output, and the start report ' +
        'of the CLI was in the part it dropped, so the tools of the run ' +
        `are unknown. ${rawOutput(run)}`,
    );
  }
  if (NOT_RUNNABLE.has(exitCode)) {
    return new GeneratorCliMissingError(
      `The generator sandbox did not start the CLI: it ended with the exit ` +
        `code ${String(exitCode)} and no start report. ${rawOutput(run)}`,
    );
  }
  return endedEarlyFault(run, rules, 'start report');
}

/** Why a run ended without the event it was waited for. */
export function endedEarlyFault(
  run: FinishedRun,
  rules: RunRules,
  missing: string,
): Error {
  if (loginRefused(run, '')) {
    return loginFault(run, rules);
  }
  const ended = `The CLI ended with the exit code ${String(run.ended.exitCode)} and no ${missing}.`;
  if (run.ended.exitCode === 0) {
    return new GeneratorOutputUnreadableError(`${ended} ${rawOutput(run)}`);
  }
  return new GeneratorFailedError(
    `${ended} It said: ${said(run.stream.plainText, rules)} ${rawOutput(run)}`,
  );
}

/**
 * Why a result failed that is neither a limit nor a spent usage: its
 * login, or an error such as one of the model's service.
 */
export function failedResultFault(
  run: FinishedRun,
  rules: RunRules,
  result: ResultEvent,
): Error {
  const failure = failureTextOf(result);
  if (loginRefused(run, failure)) {
    return loginFault(run, rules);
  }
  return new GeneratorFailedError(
    `The CLI failed with ${said(result.subtype, rules)}. It said: ` +
      `${said(failure, rules)} ${rawOutput(run)}`,
  );
}
