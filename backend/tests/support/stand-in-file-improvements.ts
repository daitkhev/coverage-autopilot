import type {
  FileImprovementDto,
  FileImprovements,
} from '#coverage/application/contracts/file-improvements';
import { FilePath } from '#kernel/primitives/file-path';
import type { RepositoryId } from '#kernel/primitives/repository-id';

/** The id of the improvement of `src/used.ts` the stand-in can answer. */
export const USED_IMPROVEMENT_ID = '00000000-0000-4000-8000-000000000101';

/** The work on the files a test sets, and every repository it was asked. */
export interface StandInFileImprovements extends FileImprovements {
  /** No improvement until a test sets one. */
  latest: FileImprovementDto[];
  readonly asked: RepositoryId[];
}

/** The port of the coverage module as the improvement module answers it. */
export function standInFileImprovements(): StandInFileImprovements {
  const stand: StandInFileImprovements = {
    latest: [],
    asked: [],
    latestOf: async (repositoryId) => {
      stand.asked.push(repositoryId);
      return Promise.resolve(stand.latest);
    },
  };
  return stand;
}

/** The newest improvement of `src/used.ts`, completed. */
export function usedFileImproved(): FileImprovementDto {
  return {
    path: FilePath.create('src/used.ts'),
    latest: { id: USED_IMPROVEMENT_ID, status: 'completed' },
  };
}
