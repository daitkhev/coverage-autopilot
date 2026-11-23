import { PUSH_REASONS } from '#harness/agents/denied-command';
import { type Judge, judgeOnce } from '#harness/agents/done-verdict';
import { DONE_PROFILE } from '#harness/agents/full-gate';
import { isNoCommit } from '#harness/architecture/git';
import { exitCodeOf } from '#harness/gate/exit-code';
import type { Host } from '#harness/gate/host';
import { HarnessError } from '#harness/shared/harness.error';

/** The branch that takes changes through a pull request only. */
const PROTECTED_REF = 'refs/heads/main';

/** One line git gives its hook before a push: a name that is updated. */
interface PushedRef {
  readonly localCommit: string;
  readonly remoteRef: string;
  readonly remoteCommit: string;
}

/** What the hook needs besides the machine. */
export interface PushChecks {
  /** Whether the first commit is in the history of the second. */
  readonly isAncestor: (older: string, newer: string) => boolean;
  readonly judge: Judge;
}

/** Git writes one name to a line: local name and commit, remote ones. */
function pushedRefsOf(input: string): PushedRef[] {
  return input
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const [, localCommit, remoteRef, remoteCommit] = line.trim().split(' ');
      if (remoteCommit === undefined || remoteRef === undefined) {
        throw new HarnessError(
          `Git gave the hook a line it cannot read: ${line}`,
        );
      }
      return { localCommit: localCommit ?? '', remoteRef, remoteCommit };
    });
}

/**
 * A push rewrites history when the commit the remote has is not in the
 * history of the commit it gets. A new name and a removed name rewrite
 * nothing.
 */
function rewrites(ref: PushedRef, checks: PushChecks): boolean {
  const moves = !isNoCommit(ref.localCommit) && !isNoCommit(ref.remoteCommit);
  return moves && !checks.isAncestor(ref.remoteCommit, ref.localCommit);
}

function reasonToRefuse(
  refs: readonly PushedRef[],
  checks: PushChecks,
): string | undefined {
  if (refs.some((ref) => ref.remoteRef === PROTECTED_REF)) {
    return PUSH_REASONS.protected;
  }
  return refs.some((ref) => rewrites(ref, checks))
    ? PUSH_REASONS.forced
    : undefined;
}

/** Why a tree that is not green is not pushed, in words for a person. */
function redReason(root: string, judge: Judge): string | undefined {
  const verdict = judgeOnce(root, judge);
  if (verdict.kind === 'red') {
    return (
      `check ${DONE_PROFILE} is red at ${verdict.step.name}. ` +
      `Make it green, then push again.\n\n${verdict.step.output}`
    );
  }
  return verdict.kind === 'still_red'
    ? `check ${DONE_PROFILE} is red at ${verdict.step} on this tree. ` +
        `Run node harness/bin/check.ts ${DONE_PROFILE} to see it.`
    : undefined;
}

/**
 * What git runs before a push, for a person and for an agent alike. It
 * reads the names git is about to update, so it does not matter how the
 * command was written. Refused: a push to the protected branch, a push
 * that rewrites history, and a push of a tree the full gate does not
 * pass. A push that updates nothing is not judged.
 */
export function beforePush(
  input: string,
  host: Host,
  checks: PushChecks,
): number {
  return exitCodeOf(host, () => {
    const refs = pushedRefsOf(input);
    if (refs.length === 0) {
      return 0;
    }
    const reason =
      reasonToRefuse(refs, checks) ?? redReason(host.root, checks.judge);
    if (reason === undefined) {
      return 0;
    }
    host.print(`push refused: ${reason}`);
    return 1;
  });
}
