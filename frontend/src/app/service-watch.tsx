import { useCallback } from 'react';

import type { ActiveWork } from '@coverage-autopilot/api-contracts/health';

import type { ClientSession } from '#api/client-session';
import type { ServiceApi } from '#api/service-api';
import { ServiceUnreachableError } from '#api/service-unreachable-error';
import { useRepeatedRequest } from '#hooks/use-repeated-request';
import type { ServiceState } from '#theme/status';

/** What the header and the way out need to know of the service. */
export interface ServiceWatch {
  readonly state: ServiceState;
  /** The improvements that wait for the user. */
  readonly needsUser: number;
  /** The work that runs, or nothing before the first answer. */
  readonly activeWork: ActiveWork | undefined;
  /** Nothing answers on the socket, so the service has to be reached again. */
  readonly lost: boolean;
}

interface Seen {
  readonly activeWork: ActiveWork;
  readonly needsUser: number;
}

/** The header asks the service again about once a second. */
const ASK_EVERY_MS = 1000;

async function look(api: ServiceApi): Promise<Seen> {
  const [health, improvements] = await Promise.all([
    api.health(),
    api.listImprovements(),
  ]);
  const waiting =
    improvements.outcome === 'answered'
      ? improvements.value.items.filter(
          ({ waitingFor }) => waitingFor === 'approval',
        )
      : [];
  return { activeWork: health.activeWork, needsUser: waiting.length };
}

function stateOf({
  answered,
  stale,
}: {
  readonly answered: boolean;
  readonly stale: boolean;
}): ServiceState {
  if (stale) {
    return 'unreachable';
  }
  return answered ? 'up' : 'starting';
}

/**
 * Asks the service again and again how it is, for every screen at once.
 * A failed try keeps the last answer, and says the service is down.
 */
export function useServiceWatch(session: ClientSession): ServiceWatch {
  const request = useCallback(async () => look(session.api), [session]);
  const { answer, stale, failure } = useRepeatedRequest(request, ASK_EVERY_MS);
  return {
    state: stateOf({ answered: answer !== undefined, stale }),
    needsUser: answer?.needsUser ?? 0,
    activeWork: answer?.activeWork,
    lost: failure instanceof ServiceUnreachableError,
  };
}
