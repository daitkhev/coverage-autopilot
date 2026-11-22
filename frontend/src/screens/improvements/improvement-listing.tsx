import type { ErrorBody } from '@coverage-autopilot/api-contracts/errors';
import type { Improvement } from '@coverage-autopilot/api-contracts/improvements';
import type { RepositoryList } from '@coverage-autopilot/api-contracts/repositories';

import type { ServiceAnswer, ServiceApi } from '#api/service-api';
import {
  type GroupName,
  groupOf,
} from '#screens/improvements/improvement-words';
import { repositoryName } from '#theme/names';

/** The order of the groups: what needs the user always comes first. */
export const GROUP_ORDER: readonly GroupName[] = [
  'needsYou',
  'running',
  'waiting',
  'finished',
];

/**
 * Every improvement in the order of its group, and the names of the
 * repositories, or what the service refused the list with.
 */
export type Listing =
  | {
      readonly outcome: 'answered';
      readonly improvements: readonly Improvement[];
      /** `owner/name` by the id of the repository. */
      readonly names: ReadonlyMap<string, string>;
    }
  | { readonly outcome: 'refused'; readonly error: ErrorBody };

/** The order of the service stays inside a group. */
function inGroups(improvements: readonly Improvement[]): Improvement[] {
  return GROUP_ORDER.flatMap((group) =>
    improvements.filter((improvement) => groupOf(improvement) === group),
  );
}

/** A list of repositories that was refused names none: ids stand in. */
function namesOf(
  repositories: ServiceAnswer<RepositoryList>,
): ReadonlyMap<string, string> {
  return repositories.outcome === 'answered'
    ? new Map(
        repositories.value.items.map((repository) => [
          repository.id,
          repositoryName(repository),
        ]),
      )
    : new Map();
}

/**
 * Asks for the improvements of every repository, and for the names of
 * the repositories, which an improvement names only by id.
 */
export async function listingOf(api: ServiceApi): Promise<Listing> {
  const [improvements, repositories] = await Promise.all([
    api.listImprovements(),
    api.listRepositories(),
  ]);
  return improvements.outcome === 'answered'
    ? {
        outcome: 'answered',
        improvements: inGroups(improvements.value.items),
        names: namesOf(repositories),
      }
    : { outcome: 'refused', error: improvements.error };
}
