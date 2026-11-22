import {
  type ReactNode,
  type RefObject,
  useCallback,
  useRef,
  useState,
} from 'react';

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
import { thresholdWords } from '#screens/repositories/threshold-dialog';
import {
  type ConnectDialog,
  useConnectDialog,
} from '#screens/repositories/use-connect-dialog';
import {
  type ScanStarts,
  useScanStarts,
} from '#screens/repositories/use-scan-starts';
import { useSnapshotParameters } from '#screens/repositories/use-snapshot-parameters';
import {
  type ThresholdDialog,
  useThresholdDialog,
} from '#screens/repositories/use-threshold-dialog';
import { ASK_EVERY_MS } from '#theme/moments';
import { repositoryName } from '#theme/names';
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

/** The keys of the screen work only while no dialog takes them. */
function noDialog(connect: ConnectDialog, threshold: ThresholdDialog): boolean {
  return connect.state === undefined && threshold.parts === undefined;
}

/**
 * The scans, the dialog that connects a repository and the one of a
 * threshold, and their notice.
 */
function useStarts(
  session: ClientSession,
  asked: RefObject<number>,
): {
  readonly notice: string | undefined;
  readonly scans: ScanStarts;
  readonly connect: ConnectDialog;
  readonly threshold: ThresholdDialog;
} {
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const scans = useScanStarts({ session, asked, onNotice: setNotice });
  const connect = useConnectDialog({
    session,
    onConnected: (repository) => {
      setNotice(`${repositoryName(repository)} is connected.`);
    },
  });
  const threshold = useThresholdDialog({
    session,
    onChanged: (repository) => {
      setNotice(
        `${repositoryName(repository)} is judged by ` +
          `${thresholdWords(repository.threshold)}.`,
      );
    },
  });
  return { notice, scans, connect, threshold };
}

/**
 * The first screen: which repositories are connected and what is known
 * of each. The list is asked for again every second, `s` scans the
 * selected repository, `t` changes its threshold and `a` connects one
 * more.
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
  const { notice, scans, connect, threshold } = useStarts(session, asked);
  const starting = startingOf(listing.answer, scans);
  const actions = repositoryActions(
    { chosen, starting, layout: layoutOf(frame.size) },
    {
      selection,
      panels: { ring: focus, names: REPOSITORIES_PANELS, words: PANEL_WORDS },
      connect: connect.open,
      scan: scans.start,
      openFiles: onOpenFiles,
      changeThreshold: threshold.open,
    },
  );
  useScreenActions(actions, { active: noDialog(connect, threshold) });
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
      notice={notice}
      connect={dialogPartsOf(connect)}
      threshold={threshold.parts}
      actions={actions}
    />
  );
}
