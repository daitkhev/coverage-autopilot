import { type ReactNode, useCallback, useState } from 'react';

import type { Improvement } from '@coverage-autopilot/api-contracts/improvements';

import type { ClientSession } from '#api/client-session';
import { isServiceUnreachable } from '#api/service-unreachable-error';
import type { ShellFrame } from '#components/app-shell';
import { CancelQuestion } from '#components/cancel-question';
import { problemOf } from '#components/problem-details';
import { type DatedRequest, useDatedRequest } from '#hooks/use-dated-request';
import { useFocusRing } from '#hooks/use-focus-ring';
import { useScreenActions } from '#hooks/use-screen-actions';
import { type Selection, useSelection } from '#hooks/use-selection';
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
import { improvementsActions } from '#screens/improvements/improvements-actions';
import {
  IMPROVEMENTS_PANELS,
  ImprovementsView,
} from '#screens/improvements/improvements-view';
import { ASK_EVERY_MS } from '#theme/moments';
import { layoutOf } from '#theme/widths';

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

const NO_NAMES: ReadonlyMap<string, string> = new Map();

/** What the footer calls the list and the panel of the chosen improvement. */
const PANEL_WORDS = ['list', 'details'] as const;

/** The list the filters keep, its names, and the row chosen in it. */
interface Kept {
  readonly listing: DatedRequest<Listing>;
  readonly improvements: readonly Improvement[];
  readonly names: ReadonlyMap<string, string>;
  readonly visible: number;
  readonly selection: Selection;
}

/** Keeps the improvements whose file holds the filter, and chooses a row. */
function useKept(
  listing: DatedRequest<Listing>,
  filters: Filters,
  frame: ShellFrame,
): Kept {
  const kept = {
    ...listing,
    answer: keptBy(listing.answer, filters.path.text),
  };
  const answered =
    kept.answer?.outcome === 'answered' ? kept.answer : undefined;
  const improvements = answered?.improvements ?? [];
  const visible = visibleRowsOf(frame.size, filters.path.line === null ? 0 : 1);
  const selection = useSelection({
    count: improvements.length,
    visible,
    keys: improvements.map(({ id }) => id),
  });
  const names = answered?.names ?? NO_NAMES;
  return { listing: kept, improvements, names, visible, selection };
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
  const { selection, ...kept } = useKept(listing, filters, frame);
  const focus = useFocusRing(IMPROVEMENTS_PANELS);
  const [asked, ask] = useState<Improvement>();
  const actions = improvementsActions(
    {
      chosen: kept.improvements[selection.index],
      names: kept.names,
      filters,
      layout: layoutOf(frame.size),
    },
    {
      selection,
      panels: { ring: focus, names: IMPROVEMENTS_PANELS, words: PANEL_WORDS },
      open: onOpenImprovement,
      ask,
    },
  );
  // While the filter types the letters are its own, and the question
  // takes every key.
  useScreenActions(actions, {
    active: !filters.path.typing && asked === undefined,
  });
  return (
    <ImprovementsView
      frame={frame}
      listing={kept.listing}
      narrowing={filters}
      problem={problemOf(listing, isServiceUnreachable)}
      moment={{ now: session.now(), timeZone: session.timeZone }}
      position={selection}
      visible={kept.visible}
      focused={focus.focused}
      question={questionOf(session, asked, () => {
        ask(undefined);
      })}
      actions={actions}
    />
  );
}
