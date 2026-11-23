import { useEffect, useState } from 'react';

import type { Repository } from '@coverage-autopilot/api-contracts/repositories';
import type { ScanParameters } from '@coverage-autopilot/api-contracts/snapshots';

import type { ServiceApi } from '#api/service-api';

/** A snapshot, named with the repository its list is asked by. */
interface SnapshotOf {
  readonly repositoryId: string;
  readonly snapshotId: string;
}

/** How the snapshot was measured, when the service lists it. */
async function parametersOf(
  api: ServiceApi,
  { repositoryId, snapshotId }: SnapshotOf,
): Promise<ScanParameters | undefined> {
  const list = await api.listSnapshots(repositoryId);
  return list.outcome === 'answered'
    ? list.value.items.find(({ id }) => id === snapshotId)?.parameters
    : undefined;
}

function latestOf(repository: Repository | undefined): SnapshotOf | undefined {
  const snapshotId = repository?.latestSnapshot?.id;
  return repository === undefined || snapshotId === undefined
    ? undefined
    : { repositoryId: repository.id, snapshotId };
}

/**
 * How the latest snapshot of the repository was measured, such as its
 * test runner. A snapshot never changes, so it is asked for once, when
 * another snapshot is chosen or becomes the latest, and not on every
 * tick of the list.
 */
export function useSnapshotParameters(
  api: ServiceApi,
  repository: Repository | undefined,
): ScanParameters | undefined {
  const [known, setKnown] = useState<ReadonlyMap<string, ScanParameters>>(
    () => new Map(),
  );
  const latest = latestOf(repository);
  const wanted =
    latest === undefined || known.has(latest.snapshotId) ? undefined : latest;
  const { repositoryId, snapshotId } = wanted ?? {};
  useEffect(() => {
    if (repositoryId === undefined || snapshotId === undefined) {
      return undefined;
    }
    let live = true;
    const ask = async (): Promise<void> => {
      try {
        const parameters = await parametersOf(api, {
          repositoryId,
          snapshotId,
        });
        if (live && parameters !== undefined) {
          setKnown((last) => new Map(last).set(snapshotId, parameters));
        }
      } catch {
        // The list of repositories shows what is wrong with the service.
        // Without this answer the panel leaves out one fact.
      }
    };
    void ask();
    return () => {
      live = false;
    };
  }, [api, repositoryId, snapshotId]);
  return latest === undefined ? undefined : known.get(latest.snapshotId);
}
