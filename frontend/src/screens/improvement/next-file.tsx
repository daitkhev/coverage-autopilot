import type { Improvement } from '@coverage-autopilot/api-contracts/improvements';
import type {
  FileCoverage,
  MeasuredFile,
  SnapshotFiles,
} from '@coverage-autopilot/api-contracts/snapshots';

import type { ClientSession } from '#api/client-session';
import type { ServiceApi } from '#api/service-api';
import { faultWords } from '#components/problem-details';
import { useAction } from '#hooks/use-action';
import type { StartTarget } from '#screens/improvement/improvement-dialog';

/** A file below the threshold that no improvement was asked for yet. */
function waitsForWork(file: FileCoverage): file is MeasuredFile {
  return (
    file.state === 'measured' &&
    file.belowThreshold &&
    file.latestImprovement === null
  );
}

/**
 * The file after this one among the files of the snapshot that are below
 * the threshold and have no work yet, in the order of the service, as the
 * files screen lists them. After the last file comes the first again.
 */
export function nextFileOf(
  files: SnapshotFiles,
  current: string,
): MeasuredFile | undefined {
  const at = files.items.findIndex((file) => file.path === current);
  return [...files.items.slice(at + 1), ...files.items.slice(0, at + 1)]
    .filter((file) => file.path !== current)
    .find(waitsForWork);
}

const UNREAD = 'The files of the snapshot could not be read:';

interface NextFileWays {
  /** A line about the search, or none once a file is found. */
  readonly onNotice: (notice: string | undefined) => void;
  readonly onFound: (file: StartTarget) => void;
}

/** What a search came to: the file to start, or the line that says why none. */
type Found = { readonly target: StartTarget } | { readonly notice: string };

async function search(
  api: ServiceApi,
  { sourceSnapshotId, targetFile }: Improvement,
): Promise<Found> {
  try {
    const answer = await api.listSnapshotFiles(sourceSnapshotId);
    if (answer.outcome === 'refused') {
      return { notice: `${UNREAD} ${answer.error.message}` };
    }
    const next = nextFileOf(answer.value, targetFile);
    return next === undefined
      ? { notice: 'No other file below the threshold waits for work.' }
      : { target: { snapshotId: sourceSnapshotId, filePath: next.path } };
  } catch (failure: unknown) {
    return { notice: `${UNREAD} ${faultWords(failure)}` };
  }
}

/**
 * Finds the next file of the snapshot of the improvement that waits for
 * work, one search at a time, and hands it on to be started. Where none
 * is left it says so in one line.
 */
export function useNextFile(
  session: ClientSession,
  ways: NextFileWays,
): (improvement: Improvement) => void {
  const finding = useAction<Found>();
  return (improvement) => {
    finding.start(async () => {
      ways.onNotice('Looking for the next file below the threshold');
      const found = await search(session.api, improvement);
      if ('target' in found) {
        ways.onNotice(undefined);
        ways.onFound(found.target);
      } else {
        ways.onNotice(found.notice);
      }
      return found;
    });
  };
}
