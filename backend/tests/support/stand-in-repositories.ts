import type { WorkingCopyLoan } from '#coverage/application/contracts/coverage-public-api';
import { CommitSha } from '#kernel/primitives/commit-sha';
import { RepositoryId } from '#kernel/primitives/repository-id';
import { Instant } from '#kernel/time/instant';
import type {
  CreateWorkingCopyRequest,
  RepositoriesPublicApi,
  RepositoryDto,
} from '#repositories/application/contracts/repositories-public-api';
import {
  CAPTURED_AT,
  DEFAULT_TEST_INSTALL,
  DEFAULT_TEST_THRESHOLD,
  REPOSITORY_ID,
  SNAPSHOT_COMMIT,
} from '#tests/support/coverage-snapshots';

/** Where every stand-in working copy is. */
export const WORKING_COPY_PATH = '/work/acme-widgets';

/** The repository every stand-in working copy is a copy of. */
const STAND_IN_REPOSITORY_ID = RepositoryId.create(REPOSITORY_ID);

/** The stand-in working copy as it is lent to the tools of `owner`. */
export function loanOf(owner: string): WorkingCopyLoan {
  return {
    workingCopyPath: WORKING_COPY_PATH,
    repositoryId: STAND_IN_REPOSITORY_ID,
    owner,
  };
}

/** `acme/widgets` as the repositories module answers it. */
export function acmeWidgets(): RepositoryDto {
  return {
    id: STAND_IN_REPOSITORY_ID,
    owner: 'acme',
    name: 'widgets',
    url: 'https://github.com/acme/widgets.git',
    defaultBranch: 'main',
    connectedAt: Instant.parse(CAPTURED_AT),
    headCommit: null,
    headCheckedAt: null,
    threshold: { ...DEFAULT_TEST_THRESHOLD, isDefault: true },
    install: { ...DEFAULT_TEST_INSTALL, isDefault: true },
  };
}

export interface StandInRepositories extends RepositoriesPublicApi {
  /** `null` when the repository was removed. */
  repository: RepositoryDto | null;
  readonly created: CreateWorkingCopyRequest[];
  readonly disposed: string[];
}

/** The repository the stand-in of the repositories module holds now. */
export function heldBy(repositories: StandInRepositories): RepositoryDto {
  if (repositories.repository === null) {
    throw new Error('The stand-in of the repositories holds no repository.');
  }
  return repositories.repository;
}

/** Gives the repository of the stand-in a percent of lines of its own. */
export function judgeBy(
  repositories: StandInRepositories,
  percentage: number,
): void {
  repositories.repository = {
    ...heldBy(repositories),
    threshold: { metric: 'lines', percentage, isDefault: false },
  };
}

async function refuse(): Promise<never> {
  return Promise.reject(new Error('The coverage module never calls this.'));
}

/**
 * The repositories module as the coverage module uses it, in memory. The
 * head is `SNAPSHOT_COMMIT`. Every working copy it lends is at `path`. It
 * keeps the copies it lends and the ones given back, and lends none once
 * the signal is aborted.
 */
export function standInRepositories(
  path: string = WORKING_COPY_PATH,
): StandInRepositories {
  const stand: StandInRepositories = {
    repository: acmeWidgets(),
    created: [],
    disposed: [],
    getRepository: async () => Promise.resolve(stand.repository),
    resolveHead: async () => Promise.resolve(CommitSha.create(SNAPSHOT_COMMIT)),
    createWorkingCopy: async (request, signal) => {
      signal.throwIfAborted();
      stand.created.push(request);
      return Promise.resolve({
        id: `copy-${String(stand.created.length)}`,
        repositoryId: request.repositoryId,
        commit: request.commit,
        path,
      });
    },
    disposeWorkingCopy: async ({ workingCopyId }) => {
      stand.disposed.push(workingCopyId);
      return Promise.resolve();
    },
    checkAccess: refuse,
    assessRevision: refuse,
    extractPatch: refuse,
    applyPatch: refuse,
    publishPatch: refuse,
  };
  return stand;
}
