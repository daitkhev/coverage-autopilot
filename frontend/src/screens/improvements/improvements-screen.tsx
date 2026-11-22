import { type ReactNode, useCallback } from 'react';

import type { ClientSession } from '#api/client-session';
import { isServiceUnreachable } from '#api/service-unreachable-error';
import type { ShellFrame } from '#components/app-shell';
import { problemOf } from '#components/problem-details';
import { browseKeysOf } from '#hooks/list-keys';
import { type DatedRequest, useDatedRequest } from '#hooks/use-dated-request';
import { useFocusRing } from '#hooks/use-focus-ring';
import { useKeys } from '#hooks/use-keys';
import { useSelection } from '#hooks/use-selection';
import {
  type Filters,
  keptBy,
  queryOf,
  useFilters,
} from '#screens/improvements/improvement-filters';
import { visibleRowsOf } from '#screens/improvements/improvement-list';
import {
  type Listing,
  listingOf,
} from '#screens/improvements/improvement-listing';
import {
  IMPROVEMENTS_PANELS,
  ImprovementsView,
} from '#screens/improvements/improvements-view';
import { ASK_EVERY_MS } from '#theme/moments';

interface ImprovementsScreenProps {
  readonly session: ClientSession;
  readonly frame: ShellFrame;
  /** `enter`: the screen of one improvement. */
  readonly onOpenImprovement: (improvementId: string) => void;
}

/** The list the service allows by the filters, asked for again and again. */
function useListing(
  session: ClientSession,
  { status, repositoryId }: Filters,
): DatedRequest<Listing> {
  const request = useCallback(
    async () => listingOf(session.api, queryOf({ status, repositoryId })),
    [session, status, repositoryId],
  );
  return useDatedRequest(request, {
    now: session.now,
    everyMs: ASK_EVERY_MS,
  });
}

/** The repositories in the order of their list, for `r` to step through. */
function repositoryIdsOf(listing: Listing | undefined): string[] {
  return listing?.outcome === 'answered' ? [...listing.names.keys()] : [];
}

/**
 * All improvements of all repositories, grouped by what they need. The
 * list is asked for again every second, the filters narrow it, and
 * `enter` opens one.
 */
export function ImprovementsScreen({
  session,
  frame,
  onOpenImprovement,
}: ImprovementsScreenProps): ReactNode {
  const filters = useFilters();
  const listing = useListing(session, filters);
  const kept = {
    ...listing,
    answer: keptBy(listing.answer, filters.path.text),
  };
  const improvements =
    kept.answer?.outcome === 'answered' ? kept.answer.improvements : [];
  const visible = visibleRowsOf(frame.size, filters.path.line === null ? 0 : 1);
  const selection = useSelection({ count: improvements.length, visible });
  const focus = useFocusRing(IMPROVEMENTS_PANELS);
  const chosen = improvements[selection.index];
  useKeys(
    {
      ...browseKeysOf(selection, focus),
      ...filters.keysOf(repositoryIdsOf(listing.answer), selection.first),
      ...(chosen === undefined
        ? {}
        : {
            enter: () => {
              onOpenImprovement(chosen.id);
            },
          }),
    },
    // While the filter types, the letters are its own.
    { active: !filters.path.typing },
  );
  return (
    <ImprovementsView
      frame={frame}
      listing={kept}
      narrowing={filters}
      problem={problemOf(listing, isServiceUnreachable)}
      moment={{ now: session.now(), timeZone: session.timeZone }}
      position={selection}
      visible={visible}
      focused={focus.focused}
    />
  );
}
