import { type ReactNode, useCallback, useState } from 'react';

import type { ClientSession } from '#api/client-session';
import { ServiceUnreachableError } from '#api/service-unreachable-error';
import type { ShellFrame } from '#components/app-shell';
import { BareScreen } from '#components/bare-screen';
import { shownOf, UnansweredBody } from '#components/unanswered-body';
import { useRepeatedRequest } from '#hooks/use-repeated-request';
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

function isUnreachable(failure: unknown): boolean {
  return failure instanceof ServiceUnreachableError;
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
  const request = useRepeatedRequest(load, EVERY_MS);
  const shown = shownOf(request, isUnreachable);
  if (shown.kind !== 'answered') {
    return (
      <BareScreen
        frame={frame}
        path={PATH}
        body={<UnansweredBody title="Patch" state={shown} />}
        stale={request.stale}
        onBack={onBack}
      />
    );
  }
  return (
    <PatchView
      session={session}
      frame={frame}
      shown={shown.value}
      stale={request.stale}
      onReload={() => {
        setRound(round + 1);
      }}
      onBack={onBack}
    />
  );
}
