import { Improvement } from '#improvement/domain/entities/improvement.entity';
import type { ImprovementState } from '#improvement/domain/entities/improvement-state';
import { StaleImprovementError } from '#improvement/domain/errors/stale-improvement.error';
import type {
  ImprovementFilter,
  ImprovementRepository,
  ImprovementTarget,
  LatestImprovement,
} from '#improvement/domain/repositories/improvement.repository';
import type { ImprovementId } from '#improvement/domain/value-objects/improvement-id.vo';
import { isFinal } from '#improvement/domain/value-objects/improvement-status.vo';
import type { RequestFingerprint } from '#improvement/domain/value-objects/request-fingerprint.vo';
import type { RequestKey } from '#improvement/domain/value-objects/request-key.vo';
import type { RepositoryId } from '#kernel/primitives/repository-id';
import type { Transaction } from '#kernel/transaction/transaction';

type Match = (state: ImprovementState) => boolean;

const isActive: Match = (state) =>
  state.status !== 'failed' && state.status !== 'cancelled';

const byKey =
  (key: RequestKey): Match =>
  (state) =>
    state.request.key.equals(key);

const byFingerprint =
  (fingerprint: RequestFingerprint): Match =>
  (state) =>
    isActive(state) && state.request.fingerprint.equals(fingerprint);

const byTarget =
  (target: ImprovementTarget): Match =>
  (state) =>
    !isFinal(state.status) &&
    state.request.repositoryId.equals(target.repositoryId) &&
    state.request.targetFile.equals(target.targetFile);

/** The newest first, as the database lists them. */
function newestFirst(left: ImprovementState, right: ImprovementState): number {
  const byTime =
    right.createdAt.epochMilliseconds - left.createdAt.epochMilliseconds;
  return byTime === 0 ? right.id.value.localeCompare(left.id.value) : byTime;
}

/**
 * The store of improvements in memory. It refuses what the unique indexes
 * of the table refuse, checks the version on every save as the table
 * does, and records each write with the transaction it was made in.
 */
export class InMemoryImprovementRepository implements ImprovementRepository {
  public readonly writes: {
    improvement: Improvement;
    transaction: Transaction;
  }[] = [];
  private readonly kept = new Map<string, ImprovementState>();

  public insert(
    improvement: Improvement,
    transaction: Transaction,
  ): Promise<void> {
    const { state } = improvement;
    const indexes: Match[] = [
      (kept) => kept.id.equals(state.id),
      byKey(state.request.key),
      ...(isActive(state) ? [byFingerprint(state.request.fingerprint)] : []),
      ...(isFinal(state.status) ? [] : [byTarget(state.request)]),
    ];
    if (indexes.some((match) => this.find(match) !== null)) {
      return Promise.reject(
        new Error(`UNIQUE constraint failed: improvements ${state.id.value}`),
      );
    }
    this.keep(state, transaction);
    return Promise.resolve();
  }

  public save(
    improvement: Improvement,
    transaction: Transaction,
  ): Promise<Improvement> {
    const { state } = improvement;
    if (this.kept.get(state.id.value)?.version !== state.version) {
      return Promise.reject(
        new StaleImprovementError(
          `The improvement ${state.id.value} is not at the version ` +
            `${String(state.version)} any more, or is not stored.`,
        ),
      );
    }
    return Promise.resolve(
      this.keep({ ...state, version: state.version + 1 }, transaction),
    );
  }

  public findById(id: ImprovementId): Promise<Improvement | null> {
    return this.resolved((state) => state.id.equals(id));
  }

  public findByRequestKey(key: RequestKey): Promise<Improvement | null> {
    return this.resolved(byKey(key));
  }

  public findActiveByFingerprint(
    fingerprint: RequestFingerprint,
  ): Promise<Improvement | null> {
    return this.resolved(byFingerprint(fingerprint));
  }

  public findOpenByTarget(
    target: ImprovementTarget,
  ): Promise<Improvement | null> {
    return this.resolved(byTarget(target));
  }

  public list(filter: ImprovementFilter): Promise<Improvement[]> {
    const { repositoryId, status, targetFile } = filter;
    const listed = [...this.kept.values()]
      .filter(
        (state) =>
          (repositoryId === undefined ||
            state.request.repositoryId.equals(repositoryId)) &&
          (status === undefined || state.status === status) &&
          (targetFile === undefined ||
            state.request.targetFile.equals(targetFile)),
      )
      .sort(newestFirst);
    return Promise.resolve(listed.map((state) => Improvement.restore(state)));
  }

  /**
   * The oldest first, so the newest of a file is the one kept, and by
   * path, as the table sorts them.
   */
  public latestByTarget(
    repositoryId: RepositoryId,
  ): Promise<LatestImprovement[]> {
    const newest = new Map(
      [...this.kept.values()]
        .filter((state) => state.request.repositoryId.equals(repositoryId))
        .sort(newestFirst)
        .reverse()
        .map((state) => [state.request.targetFile.value, state]),
    );
    return Promise.resolve(
      [...newest.entries()]
        .sort(([left], [right]) => Number(left > right) - Number(left < right))
        .map(([, state]) => ({
          targetFile: state.request.targetFile,
          id: state.id,
          status: state.status,
        })),
    );
  }

  private keep(state: ImprovementState, transaction: Transaction): Improvement {
    this.kept.set(state.id.value, state);
    const improvement = Improvement.restore(state);
    this.writes.push({ improvement, transaction });
    return Improvement.restore(state);
  }

  private find(match: Match): ImprovementState | null {
    return [...this.kept.values()].find(match) ?? null;
  }

  private resolved(match: Match): Promise<Improvement | null> {
    const found = this.find(match);
    return Promise.resolve(found === null ? null : Improvement.restore(found));
  }
}
