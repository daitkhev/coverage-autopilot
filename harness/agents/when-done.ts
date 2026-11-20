import { type Judge, judgeOnce } from '#harness/agents/done-verdict';
import { DONE_PROFILE } from '#harness/agents/full-gate';
import { sendBack, tellPerson } from '#harness/agents/hook-answers';

/**
 * What the hook prints when the agent says it is done. Nothing lets the
 * agent stop. A red tree sends the agent back one time only, so an agent
 * that cannot make it green is not held for ever: when it stops again on
 * the same tree it is let go, and the person is told.
 */
export function whenDone(root: string, judge: Judge): string {
  const verdict = judgeOnce(root, judge);
  if (verdict.kind === 'red') {
    return sendBack(
      `check ${DONE_PROFILE} is red at ${verdict.step.name}. ` +
        `Make it green in the code, then stop again.\n\n${verdict.step.output}`,
    );
  }
  if (verdict.kind === 'still_red') {
    return tellPerson(
      `check ${DONE_PROFILE} is red at ${verdict.step}, ` +
        'and the agent stopped without a change to the tree.',
    );
  }
  return '';
}
