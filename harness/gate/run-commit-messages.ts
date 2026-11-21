import { COMMIT_RULES } from '#harness/gate/commit-rules';
import { exitCodeOf } from '#harness/gate/exit-code';
import type { Host, NodeCommand } from '#harness/gate/host';
import { TOOLS } from '#harness/gate/tools';
import { HarnessError } from '#harness/shared/harness.error';

/** What git gives its hook: the file that holds the message. */
const MESSAGE_FILE = '--edit';

const USAGE = 'usage: commit-messages.ts --edit <file> | <from> <to>';

/**
 * commitlint on one message that is still in its file, or on the message
 * of every commit after `from` up to `to`.
 */
export function commitMessagesCommand(
  arguments_: readonly string[],
): NodeCommand {
  const [first, second, ...rest] = arguments_;
  if (first === undefined || second === undefined || rest.length > 0) {
    throw new HarnessError(USAGE);
  }
  const what =
    first === MESSAGE_FILE
      ? [MESSAGE_FILE, second]
      : ['--from', first, '--to', second];
  return {
    nodeOptions: [],
    script: TOOLS['@commitlint/cli'],
    arguments: ['--config', COMMIT_RULES, ...what],
  };
}

/** Holds the message of a commit to the rules, for a hook of git and CI. */
export function runCommitMessages(
  arguments_: readonly string[],
  host: Host,
): number {
  return exitCodeOf(host, () =>
    host.start(commitMessagesCommand(arguments_)) ? 0 : 1,
  );
}
