import { type RefObject, useState } from 'react';

import type { ClientSession } from '#api/client-session';
import type { RepositoriesWays } from '#screens/repositories/repository-actions';
import { thresholdWords } from '#screens/repositories/threshold-dialog';
import { installWords } from '#screens/repositories/trust-dialog';
import {
  type ConnectDialog,
  useConnectDialog,
} from '#screens/repositories/use-connect-dialog';
import {
  type ScanStarts,
  useScanStarts,
} from '#screens/repositories/use-scan-starts';
import {
  type ThresholdDialog,
  useThresholdDialog,
} from '#screens/repositories/use-threshold-dialog';
import {
  type TrustDialog,
  useTrustDialog,
} from '#screens/repositories/use-trust-dialog';
import { repositoryName } from '#theme/names';

/**
 * What the keys of the screen start: the scans, the dialog that connects
 * a repository, the one of a threshold and the one of the install, and
 * the notice each leaves.
 */
export interface RepositoryStarts {
  readonly notice: string | undefined;
  readonly scans: ScanStarts;
  readonly connect: ConnectDialog;
  readonly threshold: ThresholdDialog;
  readonly trust: TrustDialog;
}

/** The keys of the screen work only while no dialog takes them. */
export function noDialog({
  connect,
  threshold,
  trust,
}: RepositoryStarts): boolean {
  return (
    connect.state === undefined &&
    threshold.parts === undefined &&
    trust.parts === undefined
  );
}

/** What the keys of the screen open and start. */
export function startWaysOf(
  starts: RepositoryStarts,
): Pick<
  RepositoriesWays,
  'connect' | 'scan' | 'changeThreshold' | 'changeInstallMode'
> {
  return {
    connect: starts.connect.open,
    scan: starts.scans.start,
    changeThreshold: starts.threshold.open,
    changeInstallMode: starts.trust.open,
  };
}

/** Each start of the screen, with the one notice they share. */
export function useRepositoryStarts(
  session: ClientSession,
  asked: RefObject<number>,
): RepositoryStarts {
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
  const trust = useTrustDialog({
    session,
    onChanged: (repository) => {
      setNotice(
        `${repositoryName(repository)} is installed ` +
          `${installWords(repository.install)}.`,
      );
    },
  });
  return { notice, scans, connect, threshold, trust };
}
