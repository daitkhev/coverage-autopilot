/**
 * The answers of a hook, as JSON. Claude Code and Codex read the same
 * ones, so a hook is written once and each agent only names it in its
 * own settings.
 */

/** How a hook answers a tool call that must not go on by itself. */
type ToolDecision = 'ask' | 'deny';

function toolAnswer(decision: ToolDecision, reason: string): string {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: decision,
      permissionDecisionReason: reason,
    },
  });
}

/** The tool call does not happen. The agent reads the reason. */
export function denyTool(reason: string): string {
  return toolAnswer('deny', reason);
}

/** The tool call waits for the person, who reads the reason. */
export function askPerson(reason: string): string {
  return toolAnswer('ask', reason);
}

/** The agent does not stop. It reads the order and goes back to work. */
export function sendBack(order: string): string {
  return JSON.stringify({ decision: 'block', reason: order });
}

/** The agent goes on as it would. The person reads the warning. */
export function tellPerson(warning: string): string {
  return JSON.stringify({ systemMessage: warning });
}
