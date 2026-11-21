import type { CommitSha } from '#kernel/primitives/commit-sha';
import { ValueObject } from '#kernel/primitives/value-object';

/**
 * What git found when it compared the commit of a snapshot with the head
 * of the default branch. The file is compared only along the history of
 * the head, so a snapshot that is not an ancestor has no answer for it.
 */
export type RevisionFacts =
  | {
      readonly headCommit: CommitSha;
      readonly snapshotIsAncestor: false;
    }
  | {
      readonly headCommit: CommitSha;
      readonly snapshotIsAncestor: true;
      readonly targetFileChanged: boolean;
    };

/** `current` and `unchanged` let the work go on, the others stop it. */
type RevisionOutcome = 'current' | 'unchanged' | 'stale' | 'diverged';

interface RevisionAssessmentProps {
  readonly outcome: RevisionOutcome;
  readonly headCommit: CommitSha;
}

function outcomeOf(snapshot: CommitSha, facts: RevisionFacts): RevisionOutcome {
  if (!facts.snapshotIsAncestor) {
    return 'diverged';
  }
  if (facts.headCommit.equals(snapshot)) {
    return 'current';
  }
  return facts.targetFileChanged ? 'stale' : 'unchanged';
}

/**
 * Whether the commit of a snapshot is still good to work from: an
 * improvement of a file that changed since would waste its tokens.
 */
export class RevisionAssessment extends ValueObject<RevisionAssessmentProps> {
  private constructor(props: RevisionAssessmentProps) {
    super(props);
  }

  public static of(
    snapshotCommit: CommitSha,
    facts: RevisionFacts,
  ): RevisionAssessment {
    return new RevisionAssessment({
      outcome: outcomeOf(snapshotCommit, facts),
      headCommit: facts.headCommit,
    });
  }

  public get outcome(): RevisionOutcome {
    return this.props.outcome;
  }

  public get headCommit(): CommitSha {
    return this.props.headCommit;
  }
}
