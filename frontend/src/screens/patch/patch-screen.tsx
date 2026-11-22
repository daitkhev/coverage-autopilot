import { type ReactNode, useCallback, useState } from 'react';

import type { ClientSession } from '#api/client-session';
import { isServiceUnreachable } from '#api/service-unreachable-error';
import type { ShellFrame } from '#components/app-shell';
import { BareScreen } from '#components/bare-screen';
import { shownOf, UnansweredBody } from '#components/unanswered-body';
import { useDatedRequest } from '#hooks/use-dated-request';
import { loadPatch } from '#screens/patch/patch-answer';
import { PatchView } from '#screens/patch/patch-view';

/** The screen asks the service again about once a second. */
const EVERY_MS = 1000;

const PATH = ['Improvements'];

interface PatchScreenProps {
  readonly session: ClientSession;
  readonly frame: ShellFrame;
  readonly improvementId: string;
  readonly onBack: () => void;
}

/**
 * What exactly will be published: the patch of the accepted attempt and
 * the evidence for it. In review mode it asks for the decision, and an
 * approval names the hash of the patch on the screen.
 */
export function PatchScreen({
  session,
  frame,
  improvementId,
  onBack,
}: PatchScreenProps): ReactNode {
  const [round, setRound] = useState(0);
  // The round is not read by the request: a new round makes a new request,
  // so the timer starts over and asks at once.
  const load = useCallback(
    () => loadPatch(session.api, improvementId),
    [session, improvementId, round],
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
        body={
          <UnansweredBody
            title="Patch"
            headline="The patch could not be read"
            state={shown}
          />
        }
        freshness={freshness}
        onBack={onBack}
      />
    );
  }
  return (
    <PatchView
      session={session}
      frame={frame}
      shown={shown.value}
      freshness={freshness}
      onReload={() => {
        setRound(round + 1);
      }}
      onBack={onBack}
    />
  );
}
