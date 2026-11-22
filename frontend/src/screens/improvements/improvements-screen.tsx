import { type ReactNode, useCallback } from 'react';

import type { ClientSession } from '#api/client-session';
import { isServiceUnreachable } from '#api/service-unreachable-error';
import type { ShellFrame } from '#components/app-shell';
import { problemOf } from '#components/problem-details';
import { browseKeysOf } from '#hooks/list-keys';
import { useDatedRequest } from '#hooks/use-dated-request';
import { useFocusRing } from '#hooks/use-focus-ring';
import { useKeys } from '#hooks/use-keys';
import { useSelection } from '#hooks/use-selection';
import { visibleRowsOf } from '#screens/improvements/improvement-list';
import { listingOf } from '#screens/improvements/improvement-listing';
import {
  IMPROVEMENTS_PANELS,
  ImprovementsView,
} from '#screens/improvements/improvements-view';

interface ImprovementsScreenProps {
  readonly session: ClientSession;
  readonly frame: ShellFrame;
  /** `enter`: the screen of one improvement. */
  readonly onOpenImprovement: (improvementId: string) => void;
}

/** The screen asks the service again about once a second. */
const ASK_EVERY_MS = 1000;

/**
 * All improvements of all repositories, grouped by what they need. The
 * list is asked for again every second, and `enter` opens one.
 */
export function ImprovementsScreen({
  session,
  frame,
  onOpenImprovement,
}: ImprovementsScreenProps): ReactNode {
  const request = useCallback(async () => listingOf(session.api), [session]);
  const listing = useDatedRequest(request, {
    now: session.now,
    everyMs: ASK_EVERY_MS,
  });
  const improvements =
    listing.answer?.outcome === 'answered' ? listing.answer.improvements : [];
  const visible = visibleRowsOf(frame.size);
  const selection = useSelection({ count: improvements.length, visible });
  const focus = useFocusRing(IMPROVEMENTS_PANELS);
  const chosen = improvements[selection.index];
  useKeys(
    {
      ...browseKeysOf(selection, focus),
      ...(chosen === undefined
        ? {}
        : {
            enter: () => {
              onOpenImprovement(chosen.id);
            },
          }),
    },
    { active: true },
  );
  return (
    <ImprovementsView
      frame={frame}
      listing={listing}
      problem={problemOf(listing, isServiceUnreachable)}
      moment={{ now: session.now(), timeZone: session.timeZone }}
      position={selection}
      visible={visible}
      focused={focus.focused}
    />
  );
}
