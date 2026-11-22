import { InvalidRepositoryIdError } from '#kernel/errors/invalid-repository-id.error';
import { RepositoryId } from '#kernel/primitives/repository-id';
import type {
  RepositoriesPublicApi,
  RepositoryDto,
} from '#repositories/application/contracts/repositories-public-api';

/**
 * A route takes any text as an id, and the kernel refuses one that is no
 * repository id by throwing. That text names no repository, which is an
 * answer and not a fault.
 */
function repositoryIdOf(text: string): RepositoryId | null {
  try {
    return RepositoryId.create(text);
  } catch (error) {
    if (error instanceof InvalidRepositoryIdError) {
      return null;
    }
    throw error;
  }
}

/** The repository a route names by its id, or `null` when none has it. */
export async function findNamedRepository(
  repositories: RepositoriesPublicApi,
  text: string,
): Promise<RepositoryDto | null> {
  const repositoryId = repositoryIdOf(text);
  return repositoryId === null
    ? null
    : repositories.getRepository({ repositoryId });
}
