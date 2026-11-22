import { type ReactNode, useEffect, useEffectEvent, useState } from 'react';

import type { ClientSession } from '#api/client-session';
import type { ServiceApi } from '#api/service-api';
import type { ServiceReach } from '#api/service-reach';
import type { ServiceStep } from '#api/service-start';
import { App } from '#app/app';
import type { NotReached } from '#app/service-reach-words';
import { ServiceNotReached, StartingService } from '#app/service-start-view';
import { type ActionState, useAction } from '#hooks/use-action';

/** Reaches the service, and tells of each step on the way. */
export type Reach = (
  observe: (step: ServiceStep) => void,
) => Promise<ServiceReach>;

interface ClientProps {
  readonly reach: Reach;
  /** Makes the session of the screens over a service that answers. */
  readonly sessionOf: (api: ServiceApi) => ClientSession;
  /** Ends the screens, with what to say after them. */
  readonly onQuit: (farewell: string | undefined) => void;
}

/** The last try, when it ended with no service. */
function problemOf(state: ActionState<ServiceReach>): NotReached | undefined {
  if (state.phase === 'failed') {
    return { outcome: 'fault', fault: state.failure };
  }
  return state.phase === 'ended' && state.outcome.outcome !== 'ready'
    ? state.outcome
    : undefined;
}

/**
 * The client with its screens: it reaches the service first, shows the
 * screens once one answers, and reaches it again when it stops answering.
 * The session is made once, so a service that came back is asked by the
 * screens that were open.
 */
export function Client({ reach, sessionOf, onQuit }: ClientProps): ReactNode {
  const reaching = useAction<ServiceReach>();
  const [step, setStep] = useState<ServiceStep>();
  const [session, setSession] = useState<ClientSession>();
  const look = (): void => {
    reaching.start(async () => {
      const answer = await reach(setStep);
      if (answer.outcome === 'ready') {
        setSession((made) => made ?? sessionOf(answer.api));
      }
      return answer;
    });
  };
  const lookFirst = useEffectEvent(look);
  useEffect(() => {
    lookFirst();
  }, []);
  const problem = problemOf(reaching.state);
  if (problem !== undefined) {
    return (
      <ServiceNotReached
        problem={problem}
        onRetry={look}
        onQuit={() => {
          onQuit(undefined);
        }}
      />
    );
  }
  return session === undefined ? (
    <StartingService step={step} />
  ) : (
    <App
      session={session}
      reviving={reaching.state.phase === 'running'}
      onLost={look}
      onQuit={onQuit}
    />
  );
}
