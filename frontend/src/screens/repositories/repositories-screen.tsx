import { type ReactNode, type RefObject, useCallback, useRef } from 'react';

import type { ClientSession } from '#api/client-session';
import { isServiceUnreachable } from '#api/service-unreachable-error';
import type { ShellFrame } from '#components/app-shell';
import { problemOf } from '#components/problem-details';
import { type DatedRequest, useDatedRequest } from '#hooks/use-dated-request';
import { useFocusRing } from '#hooks/use-focus-ring';
import { useScreenActions } from '#hooks/use-screen-actions';
import { useSelection } from '#hooks/use-selection';
import {
  type ConnectDialogParts,
  REPOSITORIES_PANELS,
  RepositoriesView,
  visibleRowsOf,
} from '#screens/repositories/repositories-view';
import { repositoryActions } from '#screens/repositories/repository-actions';
import {
  listRepositoryRows,
  type RepositoryListing,
  type RepositoryWork,
  rowsOf,
  workOf,
} from '#screens/repositories/repository-listing';
import type { ConnectDialog } from '#screens/repositories/use-connect-dialog';
import {
  noDialog,
  startWaysOf,
  useRepositoryStarts,
} from '#screens/repositories/use-repository-starts';
import type { ScanStarts } from '#screens/repositories/use-scan-starts';
import { useSnapshotParameters } from '#screens/repositories/use-snapshot-parameters';
import { ASK_EVERY_MS } from '#theme/moments';
import { layoutOf } from '#theme/widths';

interface RepositoriesScreenProps {
  readonly session: ClientSession;
  readonly frame: ShellFrame;
  /** `enter`: the files of the latest snapshot of a repository. */
  readonly onOpenFiles: (repositoryId: string) => void;
}

/** What the footer calls the list and the panel of the chosen repository. */
const PANEL_WORDS = ['list', 'details'] as const;

interface NumberedListing {
  /** The number of the last list request started. */
  readonly asked: RefObject<number>;
  readonly listing: DatedRequest<RepositoryListing>;
}

/** The list asked for again and again, each request with its number. */
function useNumberedListing(session: ClientSession): NumberedListing {
  const asked = useRef(0);
  const request = useCallback(async () => {
    asked.current += 1;
    return listRepositoryRows(session.api, asked.current);
  }, [session]);
  const listing = useDatedRequest(request, {
    now: session.now,
    everyMs: ASK_EVERY_MS,
  });
  return { asked, listing };
}

/** The improvements of the selected repository, asked for again too. */
function useWork(
  session: ClientSession,
  repositoryId: string | undefined,
): DatedRequest<RepositoryWork | undefined> {
  const request = useCallback(
    async () => workOf(session.api, repositoryId),
    [session, repositoryId],
  );
  return useDatedRequest(request, { now: session.now, everyMs: ASK_EVERY_MS });
}

/** The repositories whose scan was started here and the list does not show. */
function startingOf(
  listing: RepositoryListing | undefined,
  scans: ScanStarts,
): ReadonlySet<string> {
  const listedBy = listing?.asked ?? 0;
  return new Set(
    rowsOf(listing).flatMap(({ repository: { id } }) =>
      scans.starting(id, listedBy) ? [id] : [],
    ),
  );
}

function dialogPartsOf(connect: ConnectDialog): ConnectDialogParts | undefined {
  return connect.state === undefined
    ? undefined
    : {
        state: connect.state,
        onChange: connect.change,
        onConfirm: connect.confirm,
        onClose: connect.close,
      };
}

/**
 * The first screen: which repositories are connected and what is known
 * of each. The list is asked for again every second, `s` scans the
 * selected repository, `t` changes its threshold, `i` how it is installed
 * and `a` connects one more.
 */
export function RepositoriesScreen({
  session,
  frame,
  onOpenFiles,
}: RepositoriesScreenProps): ReactNode {
  const { asked, listing } = useNumberedListing(session);
  const rows = rowsOf(listing.answer);
  const visible = visibleRowsOf(frame.size);
  const selection = useSelection({
    count: rows.length,
    visible,
    keys: rows.map(({ repository }) => repository.id),
  });
  const focus = useFocusRing(REPOSITORIES_PANELS);
  const chosen = rows[selection.index];
  const work = useWork(session, chosen?.repository.id);
  const parameters = useSnapshotParameters(session.api, chosen?.repository);
  const starts = useRepositoryStarts(session, asked);
  const starting = startingOf(listing.answer, starts.scans);
  const actions = repositoryActions(
    { chosen, starting, layout: layoutOf(frame.size) },
    {
      selection,
      panels: { ring: focus, names: REPOSITORIES_PANELS, words: PANEL_WORDS },
      openFiles: onOpenFiles,
      ...startWaysOf(starts),
    },
  );
  useScreenActions(actions, { active: noDialog(starts) });
  return (
    <RepositoriesView
      frame={frame}
      listing={listing}
      work={work.answer}
      parameters={parameters}
      problem={problemOf(listing, isServiceUnreachable)}
      now={session.now()}
      position={selection}
      visible={visible}
      focused={focus.focused}
      starting={starting}
      notice={starts.notice}
      connect={dialogPartsOf(starts.connect)}
      threshold={starts.threshold.parts}
      trust={starts.trust.parts}
      actions={actions}
    />
  );
}
