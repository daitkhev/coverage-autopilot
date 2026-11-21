import type { RepositoryId } from '#kernel/primitives/repository-id';
import { RepositoryNotFoundError } from '#repositories/application/errors/repository-not-found.error';
import type { Repository } from '#repositories/domain/entities/repository.entity';
import type { RepositoryRepository } from '#repositories/domain/repositories/repository.repository';

/** The repository an operation names, which must be connected. */
export async function loadRepository(
  repositories: RepositoryRepository,
  id: RepositoryId,
): Promise<Repository> {
  const repository = await repositories.findById(id);
  if (repository === null) {
    throw new RepositoryNotFoundError(
      `No connected repository has the id ${id.value}.`,
    );
  }
  return repository;
}
