import type { Repository } from '@coverage-autopilot/api-contracts/repositories';
import type {
  FileCoverage,
  SnapshotFiles,
} from '@coverage-autopilot/api-contracts/snapshots';

import type { ServiceAnswer, ServiceApi } from '#api/service-api';

/** The repository, and the files of its latest snapshot when it has one. */
export interface FilesView {
  readonly repository: Repository;
  readonly files: SnapshotFiles | undefined;
}

/**
 * The repository and the files of its latest snapshot, in one answer, so
 * the screen asks one request on its timer. A refusal of either is the
 * answer.
 */
export async function loadFiles(
  api: ServiceApi,
  repositoryId: string,
): Promise<ServiceAnswer<FilesView>> {
  const repository = await api.getRepository(repositoryId);
  if (repository.outcome === 'refused') {
    return repository;
  }
  const snapshot = repository.value.latestSnapshot;
  if (snapshot === null) {
    return {
      ...repository,
      value: { repository: repository.value, files: undefined },
    };
  }
  const files = await api.listSnapshotFiles(snapshot.id);
  return files.outcome === 'refused'
    ? files
    : { ...files, value: { repository: repository.value, files: files.value } };
}

/** One of the four lists of the screen, and the files it holds. */
export interface FileList {
  readonly label: string;
  /** What its files are, after their count in the status line. */
  readonly said: string;
  /** Whether its files have numbers, so its columns are the numbers. */
  readonly numbers: boolean;
  /** What the list says when it holds no file. */
  readonly empty: string;
  /** A line under the files, such as that they are not at 0%. */
  readonly note?: string;
  readonly holds: (file: FileCoverage) => boolean;
}

/**
 * The four lists. Each is cut from the one answer by what the service
 * says of a file, its state and whether it is below the threshold, so
 * the screen judges nothing itself and keeps the order of the service.
 */
export const FILE_LISTS: readonly [FileList, ...FileList[]] = [
  {
    label: 'Below',
    said: 'below the threshold',
    numbers: true,
    empty: 'No file is below the threshold.',
    holds: (file) => file.state === 'measured' && file.belowThreshold,
  },
  {
    label: 'All',
    said: 'in the snapshot',
    numbers: true,
    empty: 'The snapshot has no file.',
    holds: () => true,
  },
  {
    label: 'Not measured',
    said: 'without numbers',
    numbers: false,
    empty: 'Every file was measured.',
    note: 'These files have no percentage. They are not at 0%.',
    holds: (file) => file.state === 'unmeasured',
  },
  {
    label: 'No code',
    said: 'without code',
    numbers: false,
    empty: 'Every file has code.',
    holds: (file) => file.state === 'no_executable_code',
  },
];

/** The files of a list whose path holds the filter, in any case. */
export function filesOf(
  items: readonly FileCoverage[],
  { list, filter }: { readonly list: FileList; readonly filter: string },
): FileCoverage[] {
  const part = filter.toLowerCase();
  return items.filter(
    (file) => list.holds(file) && file.path.toLowerCase().includes(part),
  );
}
