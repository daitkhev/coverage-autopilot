import type { ErrorBody } from '@coverage-autopilot/api-contracts/errors';
import type { ImprovementList } from '@coverage-autopilot/api-contracts/improvements';
import type { Repository } from '@coverage-autopilot/api-contracts/repositories';
import type { Scan } from '@coverage-autopilot/api-contracts/scans';

import type { ServiceAnswer, ServiceApi } from '#api/service-api';

/** A repository, and the scan that has not ended with its steps. */
export interface RepositoryRow {
  readonly repository: Repository;
  readonly scan: Scan | undefined;
}

/**
 * The rows of the list, or what the service refused it with. `asked` is
 * the number of the request, so a scan this screen started is judged by
 * a list that was asked for after it.
 */
export type RepositoryListing =
  | {
      readonly outcome: 'answered';
      readonly rows: readonly RepositoryRow[];
      readonly asked: number;
    }
  | {
      readonly outcome: 'refused';
      readonly error: ErrorBody;
      readonly asked: number;
    };

/** The rows of an answer; a refusal or no answer yet has none. */
export function rowsOf(
  listing: RepositoryListing | undefined,
): readonly RepositoryRow[] {
  return listing?.outcome === 'answered' ? listing.rows : [];
}

/** A scan that ended between the two requests is no longer there. */
async function activeScanOf(
  api: ServiceApi,
  { activeScanId }: Repository,
): Promise<Scan | undefined> {
  if (activeScanId === null) {
    return undefined;
  }
  const scan = await api.getScan(activeScanId);
  return scan.outcome === 'answered' ? scan.value : undefined;
}

/**
 * Asks for the repositories, and for the steps of each scan that runs:
 * the answer of a repository names its scan only by id.
 */
export async function listRepositoryRows(
  api: ServiceApi,
  asked: number,
): Promise<RepositoryListing> {
  const list = await api.listRepositories();
  if (list.outcome === 'refused') {
    return { outcome: 'refused', error: list.error, asked };
  }
  const rows = await Promise.all(
    list.value.items.map(async (repository) => ({
      repository,
      scan: await activeScanOf(api, repository),
    })),
  );
  return { outcome: 'answered', rows, asked };
}

/** The improvements of one repository, named by it. */
export interface RepositoryWork {
  readonly repositoryId: string;
  readonly answer: ServiceAnswer<ImprovementList>;
}

/** The latest work of the selected repository, for its panel. */
export async function workOf(
  api: ServiceApi,
  repositoryId: string | undefined,
): Promise<RepositoryWork | undefined> {
  return repositoryId === undefined
    ? undefined
    : {
        repositoryId,
        answer: await api.listImprovements({ repositoryId }),
      };
}
