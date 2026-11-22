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
import { browseKeysOf } from '#hooks/list-keys';
import { type DatedRequest, useDatedRequest } from '#hooks/use-dated-request';
import { useFocusRing } from '#hooks/use-focus-ring';
import { type KeyHandlers, useKeys } from '#hooks/use-keys';
import { useSelection } from '#hooks/use-selection';
import {
  type ConnectDialogParts,
  REPOSITORIES_PANELS,
  RepositoriesView,
  visibleRowsOf,
} from '#screens/repositories/repositories-view';
import {
  listRepositoryRows,
  type RepositoryListing,
  type RepositoryRow,
  type RepositoryWork,
  rowsOf,
  workOf,
} from '#screens/repositories/repository-listing';
import { isScanning } from '#screens/repositories/repository-words';
import {
  type ConnectDialog,
  useConnectDialog,
} from '#screens/repositories/use-connect-dialog';
import {
  type ScanStarts,
  useScanStarts,
} from '#screens/repositories/use-scan-starts';
import { repositoryName } from '#theme/names';

interface RepositoriesScreenProps {
  readonly session: ClientSession;
  readonly frame: ShellFrame;
  /** `enter`: the files of the latest snapshot of a repository. */
  readonly onOpenFiles: (repositoryId: string) => void;
}

/** The screen asks the service again about once a second. */
const ASK_EVERY_MS = 1000;

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

/** The keys of the screen while no dialog is open. */
function actionsOf({
  chosen,
  starting,
  scans,
  connect,
  onOpenFiles,
}: {
  readonly chosen: RepositoryRow | undefined;
  readonly starting: ReadonlySet<string>;
  readonly scans: ScanStarts;
  readonly connect: ConnectDialog;
  readonly onOpenFiles: (repositoryId: string) => void;
}): KeyHandlers {
  if (chosen === undefined) {
    return { a: connect.open };
  }
  const { id } = chosen.repository;
  return {
    a: connect.open,
    enter: () => {
      onOpenFiles(id);
    },
    ...(isScanning(chosen, starting)
      ? {}
      : {
          s: () => {
            scans.start(id);
          },
        }),
  };
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
 * selected repository and `a` connects one more.
 */
export function RepositoriesScreen({
  session,
  frame,
  onOpenFiles,
}: RepositoriesScreenProps): ReactNode {
  const { asked, listing } = useNumberedListing(session);
  const rows = rowsOf(listing.answer);
  const visible = visibleRowsOf(frame.size);
  const selection = useSelection({ count: rows.length, visible });
  const focus = useFocusRing(REPOSITORIES_PANELS);
  const chosen = rows[selection.index];
  const work = useWork(session, chosen?.repository.id);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const scans = useScanStarts({ session, asked, onNotice: setNotice });
  const connect = useConnectDialog({
    session,
    onConnected: (repository) => {
      setNotice(`${repositoryName(repository)} is connected.`);
    },
  });
  const starting = startingOf(listing.answer, scans);
  useKeys(
    {
      ...browseKeysOf(selection, focus),
      ...actionsOf({ chosen, starting, scans, connect, onOpenFiles }),
    },
    { active: connect.state === undefined },
  );
  return (
    <RepositoriesView
      frame={frame}
      listing={listing}
      work={work.answer}
      problem={problemOf(listing, isServiceUnreachable)}
      now={session.now()}
      position={selection}
      visible={visible}
      focused={focus.focused}
      starting={starting}
      notice={notice}
      connect={dialogPartsOf(connect)}
    />
  );
}
