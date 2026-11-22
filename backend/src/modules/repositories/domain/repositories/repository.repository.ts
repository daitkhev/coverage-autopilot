import type { RepositoryId } from '#kernel/primitives/repository-id';
import type { Transaction } from '#kernel/transaction/transaction';
import type { Repository } from '#repositories/domain/entities/repository.entity';
import type { RepositoryUrl } from '#repositories/domain/value-objects/repository-url.vo';

/**
 * Where connected repositories are kept. A read takes the transaction of
 * its caller when it has one. A write always does: the database has one
 * connection, and a write outside the caller's transaction would land in
 * whichever transaction happens to be open on it.
 */
export interface RepositoryRepository {
  findById(
    id: RepositoryId,
    transaction?: Transaction,
  ): Promise<Repository | null>;

  /**
   * The repository with the owner and the name of the address, in any
   * case of letters, because the host does not tell them apart.
   */
  findByUrl(
    url: RepositoryUrl,
    transaction?: Transaction,
  ): Promise<Repository | null>;

  /** Every connected repository, the oldest connection first. */
  list(): Promise<Repository[]>;

  /**
   * Adds a new repository, or keeps the head, the threshold and the install
   * mode of one already there.
   */
  save(repository: Repository, transaction: Transaction): Promise<void>;
}

/** The injection token of the store of repositories. */
export const REPOSITORY_REPOSITORY = Symbol('RepositoryRepository');
