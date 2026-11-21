import type { Improvement } from '#improvement/domain/entities/improvement.entity';
import type { ImprovementId } from '#improvement/domain/value-objects/improvement-id.vo';
import type { ImprovementStatus } from '#improvement/domain/value-objects/improvement-status.vo';
import type { RequestFingerprint } from '#improvement/domain/value-objects/request-fingerprint.vo';
import type { RequestKey } from '#improvement/domain/value-objects/request-key.vo';
import type { FilePath } from '#kernel/primitives/file-path';
import type { RepositoryId } from '#kernel/primitives/repository-id';
import type { Transaction } from '#kernel/transaction/transaction';

/** A file of a repository, which one open improvement at most works on. */
export interface ImprovementTarget {
  readonly repositoryId: RepositoryId;
  readonly targetFile: FilePath;
}

/** What a list is narrowed to. A field left out narrows nothing. */
export interface ImprovementFilter {
  readonly repositoryId?: RepositoryId;
  readonly status?: ImprovementStatus;
  readonly targetFile?: FilePath;
}

/**
 * Where improvements are kept, with their attempts. A read takes the
 * transaction of its caller when it has one, so a look before an insert
 * sees what the insert would conflict with. A write always does.
 */
export interface ImprovementRepository {
  /** Stores a new improvement. Another with its key or work is a fault. */
  insert(improvement: Improvement, transaction: Transaction): Promise<void>;

  /**
   * Stores the changes of an improvement and gives it back with its next
   * version. A version that moved since it was read raises
   * `StaleImprovementError`, and nothing is written.
   */
  save(
    improvement: Improvement,
    transaction: Transaction,
  ): Promise<Improvement>;

  findById(
    id: ImprovementId,
    transaction?: Transaction,
  ): Promise<Improvement | null>;

  findByRequestKey(
    key: RequestKey,
    transaction?: Transaction,
  ): Promise<Improvement | null>;

  /** The improvement of the same work that did not fail or get cancelled. */
  findActiveByFingerprint(
    fingerprint: RequestFingerprint,
    transaction?: Transaction,
  ): Promise<Improvement | null>;

  /** The improvement of the file that is not in a final status. */
  findOpenByTarget(
    target: ImprovementTarget,
    transaction?: Transaction,
  ): Promise<Improvement | null>;

  /** The improvements the filter allows, the newest first. */
  list(filter: ImprovementFilter): Promise<Improvement[]>;
}

/** The injection token of the store of improvements. */
export const IMPROVEMENT_REPOSITORY = Symbol('ImprovementRepository');
