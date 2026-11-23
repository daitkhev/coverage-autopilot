import { InvalidRepositoryIdError } from '#kernel/errors/invalid-repository-id.error';
import { RepositoryId } from '#kernel/primitives/repository-id';
import type { Transaction } from '#kernel/transaction/transaction';
import { RepositoryNotFoundError } from '#repositories/application/errors/repository-not-found.error';
import type { Repository } from '#repositories/domain/entities/repository.entity';
import type { RepositoryRepository } from '#repositories/domain/repositories/repository.repository';

/**
 * The repository an operation names, which must be connected, read in the
 * transaction of the caller when it has one.
 */
export async function loadRepository(
  repositories: RepositoryRepository,
  id: RepositoryId,
  transaction?: Transaction,
): Promise<Repository> {
  const repository = await repositories.findById(id, transaction);
  if (repository === null) {
    throw new RepositoryNotFoundError(
      `No connected repository has the id ${id.value}.`,
    );
  }
  return repository;
}

/**
 * The kernel reads an id only by throwing, and a text a person sent that
 * cannot be an id is no fault: it names no repository.
 */
function idOf(text: string): RepositoryId | null {
  try {
    return RepositoryId.create(text);
  } catch (error) {
    if (error instanceof InvalidRepositoryIdError) {
      return null;
    }
    throw error;
  }
}

/**
 * The repository a text names, or `null` when none has it as its id, read
 * in the transaction of the caller when it has one.
 */
export async function findRepository(
  repositories: RepositoryRepository,
  text: string,
  transaction?: Transaction,
): Promise<Repository | null> {
  const id = idOf(text);
  return id === null ? null : repositories.findById(id, transaction);
}
