import { type ReactNode, useCallback } from 'react';

import type { StopServiceResult } from '@coverage-autopilot/api-contracts/health';

import type { ClientSession } from '#api/client-session';
import type { ServiceAnswer } from '#api/service-api';
import { isServiceUnreachable } from '#api/service-unreachable-error';
import type { ShellFrame } from '#components/app-shell';
import { faultOf } from '#components/problem-details';
import { useAction } from '#hooks/use-action';
import { useDatedRequest } from '#hooks/use-dated-request';
import { useFocusRing } from '#hooks/use-focus-ring';
import { useScreenActions } from '#hooks/use-screen-actions';
import { restartBlockOf, serviceActions } from '#screens/service/restart';
import { SERVICE_PANELS, ServiceView } from '#screens/service/service-view';
import { ASK_EVERY_MS } from '#theme/moments';

interface ServiceScreenProps {
  readonly session: ClientSession;
  readonly frame: ShellFrame;
}

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
  const restart = useAction<ServiceAnswer<StopServiceResult>>();
  const actions = serviceActions(restartBlockOf(health.answer, restart.state), {
    next: focus.next,
    restart: () => {
      restart.start(async () => session.api.stopService());
    },
  });
  useScreenActions(actions, { active: true });
  return (
    <ServiceView
      frame={frame}
      health={health}
      problem={faultOf(health.failure, isServiceUnreachable)}
      moment={{ now: session.now(), timeZone: session.timeZone }}
      focused={focus.focused}
      restart={restart.state}
      actions={actions}
    />
  );
}
