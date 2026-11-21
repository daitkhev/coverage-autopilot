import { hookCallOf } from '#harness/agents/hook-call';
import { workTreeAt } from '#harness/agents/work-tree';
import type { JsonRecord } from '#harness/shared/json';

/** The event of an agent that was started by another agent and stops. */
const HELPER_STOPS = 'SubagentStop';

/** What an agent wrote to the hook. A call that cannot be read says nothing. */
function callOf(input: string): JsonRecord {
  try {
    return hookCallOf(input);
  } catch {
    return {};
  }
}

/**
 * The tree to judge when an agent says it is done, or nothing when there
 * is none to judge.
 *
 * An agent is judged in the tree it works in, which it names by its
 * folder. An agent that names no folder of the repository is judged in
 * the first tree. A helper is judged only when it has a tree of its own:
 * in the first tree it is one step of the agent that started it, and
 * that agent is judged when it stops itself.
 */
export function treeToJudge(input: string, home: string): string | undefined {
  const call = callOf(input);
  const folder = call['cwd'];
  const tree =
    typeof folder === 'string' ? workTreeAt(folder, home) : undefined;
  if (call['hook_event_name'] === HELPER_STOPS) {
    return tree?.linked === true ? tree.root : undefined;
  }
  return tree?.root ?? home;
}
