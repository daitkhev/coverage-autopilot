import { type ReactNode, useCallback, useState } from 'react';

import type { ClientSession } from '#api/client-session';
import { isServiceUnreachable } from '#api/service-unreachable-error';
import type { ShellFrame } from '#components/app-shell';
import { BareScreen } from '#components/bare-screen';
import { shownOf, UnansweredBody } from '#components/unanswered-body';
import { useDatedRequest } from '#hooks/use-dated-request';
import { loadImprovement } from '#screens/improvement/improvement-answer';
import { ImprovementView } from '#screens/improvement/improvement-view';
import { ASK_EVERY_MS } from '#theme/moments';

const PATH = ['Improvements'];

interface ImprovementScreenProps {
  readonly session: ClientSession;
  readonly frame: ShellFrame;
  readonly improvementId: string;
  readonly onOpenPatch: (improvementId: string) => void;
  readonly onBack: () => void;
}

/** Work this screen moved on to, from the improvement it was opened for. */
interface Followed {
  readonly from: string;
  readonly to: string;
}

/**
 * The improvement the screen shows: the one it was opened for, or the
 * work it moved on to from there, such as one started here.
 */
function useShownId(opened: string): {
  readonly shownId: string;
  readonly follow: (improvementId: string) => void;
} {
  const [followed, setFollowed] = useState<Followed>();
  return {
    shownId: followed?.from === opened ? followed.to : opened,
    follow: (to) => {
      setFollowed({ from: opened, to });
    },
  };
}

/**
 * How far the work on one file has come and why: the screen a person
 * keeps open. It asks the service again about once a second, and closing
 * it stops nothing. Work started here is shown in place.
 */
export function ImprovementScreen(props: ImprovementScreenProps): ReactNode {
  const { session, frame, onBack } = props;
  const { shownId: improvementId, follow } = useShownId(props.improvementId);
  const load = useCallback(
    () => loadImprovement(session.api, improvementId),
    [session, improvementId],
  );
  const request = useDatedRequest(load, {
    now: session.now,
    everyMs: ASK_EVERY_MS,
  });
  const shown = shownOf(request, isServiceUnreachable);
  const freshness = { ...request, now: session.now() };
  if (shown.kind !== 'answered') {
    return (
      <BareScreen
        frame={frame}
        path={PATH}
        body={
          <UnansweredBody
            title="Improvement"
            headline="The improvement could not be read"
            state={shown}
          />
        }
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
      onOpenImprovement={follow}
    />
  );
}
