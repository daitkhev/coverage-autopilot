import type { GateRun } from '#harness/agents/full-gate';
import {
  readLastVerdict,
  writeLastVerdict,
} from '#harness/agents/last-verdict';
import { type RedStep, redStepOf } from '#harness/agents/red-step';
import { fingerprintOf } from '#harness/agents/tree';

/** Runs the gate on a tree. */
export type Judge = (root: string) => GateRun;

/** What the full gate says of a tree that someone calls done. */
export type DoneVerdict =
  /** The tree passed, now or when it was judged before. */
  | { readonly kind: 'green' }
  /** The tree was judged now and is red. */
  | { readonly kind: 'red'; readonly step: RedStep }
  /** The tree was red when it was judged before, and did not change. */
  | { readonly kind: 'still_red'; readonly step: string };

/**
 * Judges a tree that an agent or a person calls done. A tree is judged
 * once: the verdict is kept with the fingerprint of the tree, and the
 * same tree gets the same verdict without a second run.
 */
export function judgeOnce(root: string, judge: Judge): DoneVerdict {
  const tree = fingerprintOf(root);
  const last = readLastVerdict(root);
  if (last?.tree === tree) {
    return last.redStep === undefined
      ? { kind: 'green' }
      : { kind: 'still_red', step: last.redStep };
  }
  const run = judge(root);
  if (run.passed) {
    writeLastVerdict(root, { tree, redStep: undefined });
    return { kind: 'green' };
  }
  const step = redStepOf(run.output);
  writeLastVerdict(root, { tree, redStep: step.name });
  return { kind: 'red', step };
}
