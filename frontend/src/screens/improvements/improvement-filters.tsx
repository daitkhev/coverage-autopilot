import { useState } from 'react';

import type { ImprovementListQuery } from '@coverage-autopilot/api-contracts/improvements';
import {
  type ImprovementStatus,
  improvementStatusSchema,
} from '@coverage-autopilot/api-contracts/statuses';

import {
  holdsFilter,
  type ListFilter,
  useListFilter,
} from '#components/list-filter';
import type { ScreenAction } from '#hooks/use-screen-actions';
import type { Listing } from '#screens/improvements/improvement-listing';
import type { Layout } from '#theme/widths';

/** What the list is narrowed to: a status, a repository, a part of a path. */
export interface Narrowing {
  readonly status: ImprovementStatus | undefined;
  readonly repositoryId: string | undefined;
  readonly path: ListFilter;
}

/** What the actions of the filters need from the screen. */
export interface FilterWays {
  /** `owner/name` by the id of each repository, in the order of the list. */
  readonly names: ReadonlyMap<string, string>;
  /** Goes to the first row, after a filter changed the list. */
  readonly first: () => void;
  readonly layout: Layout;
}

/** What changes the narrowing the service is asked for. */
interface Choosers {
  readonly status: (status: ImprovementStatus | undefined) => void;
  readonly repositoryId: (repositoryId: string | undefined) => void;
}

/** The narrowing of the list, and what changes it. */
export interface Filters extends Narrowing {
  readonly choose: Choosers;
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

function statusWords(status: ImprovementStatus): string {
  return `only ${status.replaceAll('_', ' ')}`;
}

/** Whose improvements the list holds: one repository, or all of them. */
function whoseOf(
  repositoryId: string | undefined,
  names: ReadonlyMap<string, string>,
): string {
  return repositoryId === undefined
    ? 'all repositories'
    : (names.get(repositoryId) ?? repositoryId);
}

/** What the status line says the list holds: whose, which, with what. */
export function narrowingFacts(
  { status, repositoryId, path }: Narrowing,
  names: ReadonlyMap<string, string>,
): string[] {
  return [
    whoseOf(repositoryId, names),
    ...(status === undefined ? [] : [statusWords(status)]),
    ...(path.text === '' ? [] : [`holding "${path.text}"`]),
  ];
}

/**
 * `f` and `r` step through the statuses and the repositories and then go
 * to the first row; `/` types a part of a path. Below the wide layout the
 * footer leaves them to the help.
 */
export function filterActions(
  { status, repositoryId, path, choose }: Filters,
  { names, first, layout }: FilterWays,
): ScreenAction[] {
  const named = layout === 'wide';
  const nextStatus = nextOf(improvementStatusSchema.options, status);
  const nextRepository = nextOf([...names.keys()], repositoryId);
  return [
    {
      key: 'f',
      run: () => {
        choose.status(nextStatus);
        first();
      },
      ...(named ? { hint: { label: 'status' } } : {}),
      command: {
        title: 'Filter by the next status',
        target:
          nextStatus === undefined ? 'every status' : statusWords(nextStatus),
      },
    },
    {
      key: 'r',
      run: () => {
        choose.repositoryId(nextRepository);
        first();
      },
      ...(named ? { hint: { label: 'repository' } } : {}),
      command: {
        title: 'Filter by the next repository',
        target: whoseOf(nextRepository, names),
      },
    },
    {
      key: '/',
      run: path.start,
      ...(named ? { hint: { label: 'path' } } : {}),
      command: { title: 'Filter by a part of the path' },
    },
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
    choose: { status: setStatus, repositoryId: setRepositoryId },
  };
}
