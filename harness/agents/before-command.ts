import { type Branch, reasonToDeny } from '#harness/agents/denied-command';
import { denyTool } from '#harness/agents/hook-answers';
import { hookCallOf } from '#harness/agents/hook-call';
import { recordAt, stringAt } from '#harness/shared/json';

function reasonOf(input: string, branch: Branch): string | undefined {
  try {
    const call = recordAt(hookCallOf(input), 'tool_input');
    return reasonToDeny(stringAt(call, 'command'), branch);
  } catch (error) {
    return `The hook could not read the command: ${String(error)}`;
  }
}

/**
 * What the hook prints before a shell command. Nothing lets the command
 * run. A denied command is refused with its reason, and so is a command
 * the hook cannot read: a check that did not run has failed.
 */
export function beforeCommand(input: string, branch: Branch): string {
  const reason = reasonOf(input, branch);
  return reason === undefined ? '' : denyTool(reason);
}
