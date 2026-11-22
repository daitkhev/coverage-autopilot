import { type Dispatch, type SetStateAction, useRef, useState } from 'react';

import type { Repository } from '@coverage-autopilot/api-contracts/repositories';

import type { ClientSession } from '#api/client-session';
import { useOneAtATime } from '#hooks/use-one-at-a-time';
import type { ConnectState } from '#screens/repositories/connect-dialog-view';
import {
  connectAndCheck,
  type ConnectPhase,
  isEditable,
} from '#screens/repositories/connect-flow';

/** The dialog that connects a repository, and what can be done in it. */
export interface ConnectDialog {
  /** Nothing while the dialog is closed. */
  readonly state: ConnectState | undefined;
  readonly open: () => void;
  readonly close: () => void;
  readonly change: (url: string) => void;
  /** `enter`: connects the address and checks access, once at a time. */
  readonly confirm: () => void;
}

interface ConnectDialogOptions {
  readonly session: ClientSession;
  readonly onConnected: (repository: Repository) => void;
}

type DialogUpdate = (
  change: (last: ConnectState) => ConnectState | undefined,
) => void;

interface CheckRun extends ConnectDialogOptions {
  readonly state: ConnectState;
  /** Changes the dialog only while it is the one the check was run for. */
  readonly update: DialogUpdate;
}

async function runCheck({
  session,
  onConnected,
  state,
  update,
}: CheckRun): Promise<void> {
  const report = (phase: ConnectPhase): void => {
    update((last) => ({ ...last, phase }));
  };
  try {
    const repository = await connectAndCheck({
      api: session.api,
      url: state.url.trim(),
      since: session.now(),
      report,
    });
    if (repository !== undefined) {
      update(() => undefined);
      onConnected(repository);
    }
  } catch (fault: unknown) {
    report({ step: 'refused', refusal: { kind: 'fault', fault } });
  }
}

function updateOf(
  setState: Dispatch<SetStateAction<ConnectState | undefined>>,
  id: number,
): DialogUpdate {
  return (change) => {
    setState((last) => (last?.id === id ? change(last) : last));
  };
}

/**
 * The state of the dialog that connects a repository. An answer that
 * comes for a dialog that was closed meanwhile is dropped, and `enter`
 * starts nothing while the checks run.
 */
export function useConnectDialog(options: ConnectDialogOptions): ConnectDialog {
  const [state, setState] = useState<ConnectState | undefined>(undefined);
  const opened = useRef(0);
  const checks = useOneAtATime();
  return {
    state,
    open: () => {
      opened.current += 1;
      setState({ id: opened.current, url: '', phase: { step: 'editing' } });
    },
    close: () => {
      setState(undefined);
    },
    change: (url) => {
      setState((last) =>
        last === undefined
          ? last
          : { ...last, url, phase: { step: 'editing' } },
      );
    },
    confirm: () => {
      if (state !== undefined && isEditable(state.phase) && state.url !== '') {
        const update = updateOf(setState, state.id);
        checks.run(async () => runCheck({ ...options, state, update }));
      }
    },
  };
}
