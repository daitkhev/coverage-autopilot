import { type ReactNode, useCallback } from 'react';

import type { ClientSession } from '#api/client-session';
import { isServiceUnreachable } from '#api/service-unreachable-error';
import type { ShellFrame } from '#components/app-shell';
import { BareScreen } from '#components/bare-screen';
import { shownOf, UnansweredBody } from '#components/unanswered-body';
import { useDatedRequest } from '#hooks/use-dated-request';
import { loadImprovement } from '#screens/improvement/improvement-answer';
import { ImprovementView } from '#screens/improvement/improvement-view';

/** The screen asks the service again about once a second. */
const EVERY_MS = 1000;

const PATH = ['Improvements'];

interface ImprovementScreenProps {
  readonly session: ClientSession;
  readonly frame: ShellFrame;
  readonly improvementId: string;
  readonly onOpenPatch: (improvementId: string) => void;
  readonly onBack: () => void;
}

/**
 * How far the work on one file has come and why: the screen a person
 * keeps open. It asks the service again about once a second, and closing
 * it stops nothing.
 */
export function ImprovementScreen(props: ImprovementScreenProps): ReactNode {
  const { session, frame, improvementId, onBack } = props;
  const load = useCallback(
    () => loadImprovement(session.api, improvementId),
    [session, improvementId],
  );
  const request = useDatedRequest(load, {
    now: session.now,
    everyMs: EVERY_MS,
  });
  const shown = shownOf(request, isServiceUnreachable);
  const freshness = { ...request, now: session.now() };
  if (shown.kind !== 'answered') {
    return (
      <BareScreen
        frame={frame}
        path={PATH}
        body={<UnansweredBody title="Improvement" state={shown} />}
        freshness={freshness}
        onBack={onBack}
      />
    );
  }
  return (
    <ImprovementView
      {...props}
      improvement={shown.value.improvement}
      repository={shown.value.repository}
      freshness={freshness}
    />
  );
}
