import type { CommitSha } from '#kernel/primitives/commit-sha';
import { Entity } from '#kernel/primitives/entity';
import type { RepositoryId } from '#kernel/primitives/repository-id';
import type { Instant } from '#kernel/time/instant';
import type { BranchName } from '#repositories/domain/value-objects/branch-name.vo';
import type { RepositoryUrl } from '#repositories/domain/value-objects/repository-url.vo';

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
}

/**
 * A repository on the host of the code that the user connected. Its owner
 * and name come from its address, and one owner and name is connected
 * once. The head of its default branch is what the last look found.
 */
export class Repository extends Entity<RepositoryId> {
  private state: RepositoryState;

  private constructor(id: RepositoryId, state: RepositoryState) {
    super(id);
    this.state = state;
  }

  /** A repository connected now, whose head nobody has read yet. */
  public static connect(
    id: RepositoryId,
    state: Omit<RepositoryState, 'head'>,
  ): Repository {
    return new Repository(id, { ...state, head: null });
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
