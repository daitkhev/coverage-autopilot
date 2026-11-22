import { type ReactNode, useCallback, useState } from 'react';

import type { ClientSession } from '#api/client-session';
import { ServiceUnreachableError } from '#api/service-unreachable-error';
import type { ShellFrame } from '#components/app-shell';
import { useDatedRequest } from '#hooks/use-dated-request';
import { useFocusRing } from '#hooks/use-focus-ring';
import { useKeys } from '#hooks/use-keys';
import { useOneAtATime } from '#hooks/use-one-at-a-time';
import { type Restart, restartBlockOf } from '#screens/service/restart';
import { SERVICE_PANELS, ServiceView } from '#screens/service/service-view';

interface ServiceScreenProps {
  readonly session: ClientSession;
  readonly frame: ShellFrame;
}

/** The screen asks the service again about once a second. */
const ASK_EVERY_MS = 1000;

/**
 * The screen "is everything in order": the health of the service, asked
 * again every second, and `r` that restarts an idle service.
 */
export function ServiceScreen({
  session,
  frame,
}: ServiceScreenProps): ReactNode {
  const request = useCallback(async () => session.api.health(), [session]);
  const health = useDatedRequest(request, {
    now: session.now,
    everyMs: ASK_EVERY_MS,
  });
  const focus = useFocusRing(SERVICE_PANELS);
  const stopping = useOneAtATime();
  const [last, setLast] = useState<Restart>({ step: 'idle' });
  const restart: Restart = stopping.running ? { step: 'asking' } : last;
  const stop = async (): Promise<void> => {
    try {
      setLast({ step: 'answered', answer: await session.api.stopService() });
    } catch (fault: unknown) {
      setLast({ step: 'failed', fault });
    }
  };
  const blocked = restartBlockOf(health.answer, restart) !== undefined;
  useKeys(
    {
      tab: focus.next,
      ...(blocked
        ? {}
        : {
            r: () => {
              stopping.run(stop);
            },
          }),
    },
    { active: true },
  );
  return (
    <ServiceView
      frame={frame}
      health={health}
      fault={
        health.failure instanceof ServiceUnreachableError
          ? undefined
          : health.failure
      }
      moment={{ now: session.now(), timeZone: session.timeZone }}
      focused={focus.focused}
      restart={restart}
    />
  );
}
