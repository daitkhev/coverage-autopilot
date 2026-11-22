import type {
  Health,
  StopServiceResult,
} from '@coverage-autopilot/api-contracts/health';

import type { ServiceAnswer } from '#api/service-api';
import { faultWords } from '#components/problem-details';
import type { ActionState } from '#hooks/use-action';

/** Where the request to stop the service stands. */
export type Restart = ActionState<ServiceAnswer<StopServiceResult>>;

/**
 * Why the service cannot be restarted now, or nothing when it can. The
 * service refuses to stop while work runs, so the key is not offered.
 */
export function restartBlockOf(
  health: Health | undefined,
  restart: Restart,
): string | undefined {
  if (restart.phase === 'running') {
    return 'it is being stopped';
  }
  if (health === undefined) {
    return 'once the service answers';
  }
  const { scans, improvements } = health.activeWork;
  return scans > 0 || improvements > 0
    ? 'after the running work ends'
    : undefined;
}

/** What just happened to the request to stop, for the line of notices. */
export function restartNoticeOf(restart: Restart): string | undefined {
  switch (restart.phase) {
    case 'idle':
      return undefined;
    case 'running':
      return 'Asking the service to stop.';
    case 'failed':
      return `The service was not stopped: ${faultWords(restart.failure)}`;
    case 'ended':
      return restart.outcome.outcome === 'answered'
        ? 'The service stops, and starts again with the next request.'
        : restart.outcome.error.message;
  }
}
