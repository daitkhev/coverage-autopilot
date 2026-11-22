import { type ReactNode, useCallback, useState } from 'react';

import type { Improvement } from '@coverage-autopilot/api-contracts/improvements';

import type { ClientSession } from '#api/client-session';
import { isServiceUnreachable } from '#api/service-unreachable-error';
import type { ShellFrame } from '#components/app-shell';
import { CancelQuestion } from '#components/cancel-question';
import { problemOf } from '#components/problem-details';
import { browseKeysOf } from '#hooks/list-keys';
import { type DatedRequest, useDatedRequest } from '#hooks/use-dated-request';
import { useFocusRing } from '#hooks/use-focus-ring';
import { type KeyHandlers, useKeys } from '#hooks/use-keys';
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
import { canBeCancelled } from '#screens/improvements/improvement-words';
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

/** What the keys do to the chosen improvement. */
interface ChosenActions {
  readonly open: (improvementId: string) => void;
  /** Opens the question before a cancel of the work. */
  readonly ask: (improvement: Improvement) => void;
}

/** `enter` opens the chosen work, and `c` asks before it cancels it. */
function chosenKeys(
  chosen: Improvement | undefined,
  { open, ask }: ChosenActions,
): KeyHandlers {
  if (chosen === undefined) {
    return {};
  }
  return {
    enter: () => {
      open(chosen.id);
    },
    ...(canBeCancelled(chosen)
      ? {
          c: () => {
            ask(chosen);
          },
        }
      : {}),
  };
}

/** The question before a cancel, for the work it was opened on. */
function questionOf(
  session: ClientSession,
  asked: Improvement | undefined,
  onClose: () => void,
): ReactNode {
  return asked === undefined ? undefined : (
    <CancelQuestion
      improvement={asked}
      cancel={async () => session.api.cancelImprovement(asked.id)}
      onClose={onClose}
    />
  );
}

/**
 * All improvements of all repositories, grouped by what they need. The
 * list is asked for again every second, the filters narrow it, `enter`
 * opens one, and `c` cancels one after a question.
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
  const [asked, ask] = useState<Improvement>();
  useKeys(
    {
      ...browseKeysOf(selection, focus),
      ...filters.keysOf(repositoryIdsOf(listing.answer), selection.first),
      ...chosenKeys(improvements[selection.index], {
        open: onOpenImprovement,
        ask,
      }),
    },
    // While the filter types the letters are its own, and the question
    // takes every key.
    { active: !filters.path.typing && asked === undefined },
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
      question={questionOf(session, asked, () => {
        ask(undefined);
      })}
    />
  );
}
