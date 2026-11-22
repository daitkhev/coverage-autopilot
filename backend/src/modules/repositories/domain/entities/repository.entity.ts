import type { CommitSha } from '#kernel/primitives/commit-sha';
import { Entity } from '#kernel/primitives/entity';
import type { RepositoryId } from '#kernel/primitives/repository-id';
import type { Instant } from '#kernel/time/instant';
import type { BranchName } from '#repositories/domain/value-objects/branch-name.vo';
import type { RepositoryUrl } from '#repositories/domain/value-objects/repository-url.vo';
import type { ThresholdPercentage } from '#repositories/domain/value-objects/threshold-percentage.vo';

/** The head of the default branch, and the moment it was read. */
export interface RepositoryHead {
  readonly commit: CommitSha;
  readonly readAt: Instant;
}

export interface RepositoryState {
  readonly url: RepositoryUrl;
  readonly defaultBranch: BranchName;
  readonly connectedAt: Instant;
  readonly head: RepositoryHead | null;
  /** `null` while the default of the service judges its files. */
  readonly threshold: ThresholdPercentage | null;
}

/**
 * A repository on the host of the code that the user connected. Its owner
 * and name come from its address, and one owner and name is connected
 * once. The head of its default branch is what the last look found. A
 * person may give it a threshold of its own.
 */
export class Repository extends Entity<RepositoryId> {
  private state: RepositoryState;

  private constructor(id: RepositoryId, state: RepositoryState) {
    super(id);
    this.state = state;
  }

  /**
   * A repository connected now, whose head nobody has read yet, judged by
   * the default of the service.
   */
  public static connect(
    id: RepositoryId,
    state: Omit<RepositoryState, 'head' | 'threshold'>,
  ): Repository {
    return new Repository(id, { ...state, head: null, threshold: null });
  }

  /** A repository as it was saved. */
  public static restore(id: RepositoryId, state: RepositoryState): Repository {
    return new Repository(id, state);
  }

  public get url(): RepositoryUrl {
    return this.state.url;
  }

  public get defaultBranch(): BranchName {
    return this.state.defaultBranch;
  }

  public get connectedAt(): Instant {
    return this.state.connectedAt;
  }

  public get head(): RepositoryHead | null {
    return this.state.head;
  }

  public get threshold(): ThresholdPercentage | null {
    return this.state.threshold;
  }

  /** `null` gives its files back to the default of the service. */
  public changeThreshold(threshold: ThresholdPercentage | null): void {
    this.state = { ...this.state, threshold };
  }

  /**
   * Keeps what a look at the default branch found. A reading older than
   * the one kept changes nothing, so a slow look cannot undo a newer one.
   */
  public recordHead(head: RepositoryHead): void {
    const kept = this.state.head;
    if (kept !== null && head.readAt.isBefore(kept.readAt)) {
      return;
    }
    this.state = { ...this.state, head };
  }
}
