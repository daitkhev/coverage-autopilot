import type {
  Health,
  StopServiceResult,
} from '@coverage-autopilot/api-contracts/health';

import type { ServiceAnswer } from '#api/service-api';

/** Where the request to stop the service stands. */
export type Restart =
  | { readonly step: 'idle' }
  | { readonly step: 'asking' }
  | {
      readonly step: 'answered';
      readonly answer: ServiceAnswer<StopServiceResult>;
    }
  | { readonly step: 'failed'; readonly fault: unknown };

/**
 * Why the service cannot be restarted now, or nothing when it can. The
 * service refuses to stop while work runs, so the key is not offered.
 */
export function restartBlockOf(
  health: Health | undefined,
  restart: Restart,
): string | undefined {
  if (restart.step === 'asking') {
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

function faultWords(fault: unknown): string {
  return fault instanceof Error ? fault.message : String(fault);
}

/** What just happened to the request to stop, for the line of notices. */
export function restartNoticeOf(restart: Restart): string | undefined {
  switch (restart.step) {
    case 'idle':
      return undefined;
    case 'asking':
      return 'Asking the service to stop.';
    case 'failed':
      return `The service was not stopped: ${faultWords(restart.fault)}`;
    case 'answered':
      return restart.answer.outcome === 'answered'
        ? 'The service stops, and starts again with the next request.'
        : restart.answer.error.message;
  }
}
