import { heldEdit } from '#harness/agents/edit-of-policy';
import { editedFilesOf } from '#harness/agents/edited-files';
import { askPerson, denyTool } from '#harness/agents/hook-answers';
import { hookCallOf } from '#harness/agents/hook-call';

/** The way to hold an edit for an agent that can put a question. */
const ASK = 'ask';

/**
 * What the hook prints before an edit. Nothing lets the edit go on. An
 * edit of the policy waits for the owner. An agent that can ask puts the
 * question to the person. Any other agent is refused and told to ask,
 * and so is every agent in a linked tree, where no person is at hand.
 */
export function beforeEdit(
  input: string,
  home: string,
  way: string | undefined,
): string {
  const held = heldEdit(home, () => editedFilesOf(hookCallOf(input)));
  if (held === undefined) {
    return '';
  }
  return way === ASK && !held.linked
    ? askPerson(held.reason)
    : denyTool(`${held.reason} Stop and ask the owner.`);
}
