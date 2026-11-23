import { reasonToDeny } from '#harness/agents/denied-command';
import { denyTool } from '#harness/agents/hook-answers';
import { hookCallOf } from '#harness/agents/hook-call';
import { recordAt, stringAt } from '#harness/shared/json';

/** Says which branch the tree of a folder is on. */
export type BranchIn = (folder: string) => string;

/**
 * An agent says in which folder its command runs. That folder may be in
 * a tree of its own, on a branch of its own, so the branch is asked
 * there. A call that names no folder is judged in the first tree.
 */
function reasonOf(
  input: string,
  home: string,
  branchIn: BranchIn,
): string | undefined {
  try {
    const call = hookCallOf(input);
    const folder = call['cwd'];
    const command = stringAt(recordAt(call, 'tool_input'), 'command');
    return reasonToDeny(command, () =>
      branchIn(typeof folder === 'string' ? folder : home),
    );
  } catch (error) {
    return `The hook could not read the command: ${String(error)}`;
  }
}

/**
 * What the hook prints before a shell command. Nothing lets the command
 * run. A denied command is refused with its reason, and so is a command
 * the hook cannot read: a check that did not run has failed.
 */
export function beforeCommand(
  input: string,
  home: string,
  branchIn: BranchIn,
): string {
  const reason = reasonOf(input, home, branchIn);
  return reason === undefined ? '' : denyTool(reason);
}
