import { reasonToAsk } from '#harness/agents/edit-of-policy';
import { editedFilesOf } from '#harness/agents/edited-files';
import { askPerson, denyTool } from '#harness/agents/hook-answers';
import { hookCallOf } from '#harness/agents/hook-call';

/** The way to hold an edit for an agent that can put a question. */
const ASK = 'ask';

/**
 * What the hook prints before an edit. Nothing lets the edit go on. An
 * edit of the policy waits for the owner. An agent that can ask puts the
 * question to the person. Any other agent is refused and told to ask.
 */
export function beforeEdit(
  input: string,
  root: string,
  way: string | undefined,
): string {
  const reason = reasonToAsk(root, () => editedFilesOf(hookCallOf(input)));
  if (reason === undefined) {
    return '';
  }
  return way === ASK
    ? askPerson(reason)
    : denyTool(`${reason} Stop and ask the owner.`);
}
