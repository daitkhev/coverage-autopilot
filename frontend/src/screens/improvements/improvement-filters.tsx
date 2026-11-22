import { useState } from 'react';

import type { ImprovementListQuery } from '@coverage-autopilot/api-contracts/improvements';
import {
  type ImprovementStatus,
  improvementStatusSchema,
} from '@coverage-autopilot/api-contracts/statuses';

import type { KeyHint } from '#components/key-hints';
import {
  holdsFilter,
  type ListFilter,
  useListFilter,
} from '#components/list-filter';
import type { KeyHandlers } from '#hooks/use-keys';
import type { Listing } from '#screens/improvements/improvement-listing';
import type { Layout } from '#theme/widths';

/** What the list is narrowed to: a status, a repository, a part of a path. */
export interface Narrowing {
  readonly status: ImprovementStatus | undefined;
  readonly repositoryId: string | undefined;
  readonly path: ListFilter;
}

/** The narrowing of the list, and the keys that change it. */
export interface Filters extends Narrowing {
  /**
   * `f` and `r` step through the statuses and the repositories and then
   * go to the first row; `/` types a part of a path.
   */
  readonly keysOf: (
    repositoryIds: readonly string[],
    first: () => void,
  ) => KeyHandlers;
}

/**
 * The next choice after the current one, where no choice at all comes
 * before the first and after the last. A choice that is gone starts over.
 */
function nextOf<Value>(
  values: readonly Value[],
  current: Value | undefined,
): Value | undefined {
  const at = current === undefined ? -1 : values.indexOf(current);
  return values[at + 1];
}

/** The query the service narrows the list by: the status, the repository. */
export function queryOf({
  status,
  repositoryId,
}: Pick<Narrowing, 'status' | 'repositoryId'>): ImprovementListQuery {
  return {
    ...(status === undefined ? {} : { status }),
    ...(repositoryId === undefined ? {} : { repositoryId }),
  };
}

/** The improvements whose file holds the text of the filter, in their order. */
export function keptBy(
  listing: Listing | undefined,
  filter: string,
): Listing | undefined {
  return listing?.outcome === 'answered'
    ? {
        ...listing,
        improvements: listing.improvements.filter((improvement) =>
          holdsFilter(improvement.targetFile, filter),
        ),
      }
    : listing;
}

/** Whether anything narrows the list. */
export function isNarrowed({ status, repositoryId, path }: Narrowing): boolean {
  return status !== undefined || repositoryId !== undefined || path.text !== '';
}

/** What the status line says the list holds: whose, which, with what. */
export function narrowingFacts(
  { status, repositoryId, path }: Narrowing,
  names: ReadonlyMap<string, string>,
): string[] {
  const whose =
    repositoryId === undefined
      ? 'all repositories'
      : (names.get(repositoryId) ?? repositoryId);
  return [
    whose,
    ...(status === undefined ? [] : [`only ${status.replaceAll('_', ' ')}`]),
    ...(path.text === '' ? [] : [`holding "${path.text}"`]),
  ];
}

/** The keys of the filters, which at 80 columns are left to the help. */
export function filterHints(layout: Layout): KeyHint[] {
  return layout === 'narrow'
    ? []
    : [
        { key: 'f', label: 'status' },
        { key: 'r', label: 'repository' },
        { key: '/', label: 'path' },
      ];
}

/**
 * The filters of the list. The status and the repository go to the
 * service with the request; the part of a path is the one text field,
 * as the files screen filters its list.
 */
export function useFilters(): Filters {
  const [status, setStatus] = useState<ImprovementStatus>();
  const [repositoryId, setRepositoryId] = useState<string>();
  const path = useListFilter();
  return {
    status,
    repositoryId,
    path,
    keysOf: (repositoryIds, first) => ({
      f: () => {
        setStatus(nextOf(improvementStatusSchema.options, status));
        first();
      },
      r: () => {
        setRepositoryId(nextOf(repositoryIds, repositoryId));
        first();
      },
      '/': path.start,
    }),
  };
}
