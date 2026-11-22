import { type RefObject, useRef, useState } from 'react';

import type { ClientSession } from '#api/client-session';
import { newRequestKey } from '#api/request-key';
import { faultWords } from '#components/problem-details';

/**
 * A scan this screen asked for: on its way to the service, or queued
 * while the list request numbered `after` was the last one started.
 */
type Start =
  | { readonly step: 'asking' }
  | { readonly step: 'queued'; readonly after: number };

/** The scans this screen starts, one key for one press. */
export interface ScanStarts {
  /**
   * Whether a scan of the repository was started here and the list it
   * was judged by was asked for before that: then the list cannot know.
   */
  readonly starting: (repositoryId: string, listedBy: number) => boolean;
  readonly start: (repositoryId: string) => void;
}

interface ScanStartOptions {
  readonly session: ClientSession;
  /** The number of the last list request started. */
  readonly asked: RefObject<number>;
  readonly onNotice: (notice: string) => void;
}

/**
 * Starts the scans of repositories. A second press while its scan has not
 * ended starts nothing: the guard is a reference while the request runs,
 * and the start itself until a list asked for after it shows the scan.
 */
export function useScanStarts({
  session,
  asked,
  onNotice,
}: ScanStartOptions): ScanStarts {
  const [starts, setStarts] = useState<ReadonlyMap<string, Start>>(new Map());
  const asking = useRef(new Set<string>());
  const settle = (repositoryId: string, start: Start | undefined): void => {
    setStarts((last) => {
      const next = new Map(last);
      next.delete(repositoryId);
      return start === undefined ? next : next.set(repositoryId, start);
    });
  };
  const ask = async (repositoryId: string): Promise<void> => {
    try {
      const scan = await session.api.startScan(repositoryId, newRequestKey());
      if (scan.outcome === 'answered') {
        settle(repositoryId, { step: 'queued', after: asked.current });
        return;
      }
      onNotice(`The scan was not started: ${scan.error.message}`);
    } catch (fault: unknown) {
      onNotice(`The scan was not started: ${faultWords(fault)}`);
    }
    settle(repositoryId, undefined);
  };
  return {
    starting: (repositoryId, listedBy) => {
      const start = starts.get(repositoryId);
      return (
        start !== undefined &&
        (start.step === 'asking' || listedBy <= start.after)
      );
    },
    start: (repositoryId) => {
      if (asking.current.has(repositoryId)) {
        return;
      }
      asking.current.add(repositoryId);
      settle(repositoryId, { step: 'asking' });
      void ask(repositoryId).finally(() => {
        asking.current.delete(repositoryId);
      });
    },
  };
}
