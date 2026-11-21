import type { RepositoryId } from '#kernel/primitives/repository-id';
import type { Transaction } from '#kernel/transaction/transaction';
import type { Repository } from '#repositories/domain/entities/repository.entity';
import type { RepositoryRepository } from '#repositories/domain/repositories/repository.repository';
import type { RepositoryUrl } from '#repositories/domain/value-objects/repository-url.vo';

/** The store of repositories in memory, which records every write. */
export class InMemoryRepositoryRepository implements RepositoryRepository {
  /** Each save, with the transaction it was made in. */
  public readonly saves: {
    repository: Repository;
    transaction: Transaction;
  }[] = [];
  private readonly kept = new Map<string, Repository>();

  public findById(id: RepositoryId): Promise<Repository | null> {
    return Promise.resolve(this.kept.get(id.value) ?? null);
  }

  public findByUrl(url: RepositoryUrl): Promise<Repository | null> {
    const name = url.fullName.toLowerCase();
    const found = [...this.kept.values()].find(
      (repository) => repository.url.fullName.toLowerCase() === name,
    );
    return Promise.resolve(found ?? null);
  }

  public list(): Promise<Repository[]> {
    return Promise.resolve([...this.kept.values()]);
  }

  public save(repository: Repository, transaction: Transaction): Promise<void> {
    this.saves.push({ repository, transaction });
    this.kept.set(repository.id.value, repository);
    return Promise.resolve();
  }
}
