import type { CommitSha } from '#kernel/primitives/commit-sha';
import { ValueObject } from '#kernel/primitives/value-object';
import type { Instant } from '#kernel/time/instant';
import { InvalidAccessCheckError } from '#repositories/domain/errors/invalid-access-check.error';

/** The steps of the check, in the order they run. */
const STEP_NAMES = ['git_present', 'gh_authenticated', 'push_allowed'] as const;

export type AccessStepName = (typeof STEP_NAMES)[number];

const LAST_STEP: AccessStepName = 'push_allowed';

/** A failed step stops the rest, so a later step may never run. */
type AccessStepStatus = 'passed' | 'failed' | 'not_run';

export interface AccessStep {
  readonly name: AccessStepName;
  readonly status: AccessStepStatus;
  /** What the user reads. A step that did not run says nothing. */
  readonly message: string | null;
  /** The answer of the tool that refused, so the user can act on it. */
  readonly toolOutput: string | null;
}

/**
 * Where the branch and the pull request of a result go: the repository
 * when the account may push to it, and otherwise a fork in the account.
 */
export type Destination =
  | { readonly route: 'repository' }
  | { readonly route: 'fork'; readonly account: string };

/**
 * What one step found. The last step brings the head it read and where
 * a result goes.
 */
export type AccessStepOutcome =
  | {
      readonly status: 'passed';
      readonly message: string;
      readonly headCommit?: CommitSha;
      readonly destination?: Destination;
    }
  | {
      readonly status: 'failed';
      readonly message: string;
      readonly toolOutput: string | null;
    };

/** What only the last step brings, once it passed. */
interface Reach {
  readonly headCommit: CommitSha | null;
  readonly destination: Destination | null;
}

interface AccessCheckProps extends Reach {
  readonly checkedAt: Instant;
  readonly recorded: readonly AccessStep[];
}

const NOTHING_REACHED: Reach = { headCommit: null, destination: null };

function stepOf(name: AccessStepName, outcome: AccessStepOutcome): AccessStep {
  const toolOutput = outcome.status === 'failed' ? outcome.toolOutput : null;
  return { name, status: outcome.status, message: outcome.message, toolOutput };
}

/** A failed step brings nothing, and so a check that failed has neither. */
function reachOf(name: AccessStepName, outcome: AccessStepOutcome): Reach {
  if (outcome.status === 'failed') {
    return NOTHING_REACHED;
  }
  const brings = name === LAST_STEP;
  const reach = {
    headCommit: outcome.headCommit ?? null,
    destination: outcome.destination ?? null,
  };
  if (
    (reach.headCommit !== null) !== brings ||
    (reach.destination !== null) !== brings
  ) {
    throw new InvalidAccessCheckError(
      `The step ${name} brings a head and a destination only when it is the last one and passed.`,
    );
  }
  return reach;
}

/**
 * The preflight of a repository: `git` is there, `gh` is logged in, and
 * the host says where a result goes. The steps are recorded one at a
 * time in their order, and a failed step ends the check.
 */
export class AccessCheck extends ValueObject<AccessCheckProps> {
  private constructor(props: AccessCheckProps) {
    super(props);
  }

  public static begin(checkedAt: Instant): AccessCheck {
    return new AccessCheck({ checkedAt, recorded: [], ...NOTHING_REACHED });
  }

  public get checkedAt(): Instant {
    return this.props.checkedAt;
  }

  /** Read with the last step, so a check that stopped early has none. */
  public get headCommit(): CommitSha | null {
    return this.props.headCommit;
  }

  /** Known with the last step, as the head is. */
  public get destination(): Destination | null {
    return this.props.destination;
  }

  public get passed(): boolean {
    return this.props.headCommit !== null;
  }

  /** Every step in its order. A step after a failure is `not_run`. */
  public get steps(): readonly AccessStep[] {
    return STEP_NAMES.map(
      (name, index) =>
        this.props.recorded[index] ?? {
          name,
          status: 'not_run',
          message: null,
          toolOutput: null,
        },
    );
  }

  /** The step to run now, or `null` when the check is over. */
  public nextStep(): AccessStepName | null {
    const failed = this.props.recorded.some((step) => step.status === 'failed');
    return failed ? null : (STEP_NAMES[this.props.recorded.length] ?? null);
  }

  /** The check with what the next step found. */
  public record(outcome: AccessStepOutcome): AccessCheck {
    const name = this.nextStep();
    if (name === null) {
      throw new InvalidAccessCheckError(
        'The check is over: a step failed or every step ran.',
      );
    }
    return new AccessCheck({
      checkedAt: this.props.checkedAt,
      recorded: [...this.props.recorded, stepOf(name, outcome)],
      ...reachOf(name, outcome),
    });
  }
}
