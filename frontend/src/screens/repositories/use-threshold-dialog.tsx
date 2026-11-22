import { useState } from 'react';

import type { Repository } from '@coverage-autopilot/api-contracts/repositories';

import type { ClientSession } from '#api/client-session';
import type { ThresholdDialogParts } from '#screens/repositories/threshold-dialog';

/** The dialog of the threshold of a repository, and the key that opens it. */
export interface ThresholdDialog {
  /** Nothing while the dialog is closed. */
  readonly parts: ThresholdDialogParts | undefined;
  readonly open: (repository: Repository) => void;
}

interface ThresholdDialogOptions {
  readonly session: ClientSession;
  readonly onChanged: (repository: Repository) => void;
}

/**
 * The repository whose threshold the dialog changes. The dialog closes
 * once the service took the change, and the list shows it on its next
 * request.
 */
export function useThresholdDialog({
  session,
  onChanged,
}: ThresholdDialogOptions): ThresholdDialog {
  const [repository, setRepository] = useState<Repository | undefined>(
    undefined,
  );
  const close = (): void => {
    setRepository(undefined);
  };
  return {
    parts:
      repository === undefined
        ? undefined
        : {
            repository,
            change: async (percentage) =>
              session.api.changeThreshold(repository.id, { percentage }),
            onChanged: (changed) => {
              close();
              onChanged(changed);
            },
            onClose: close,
          },
    open: setRepository,
  };
}
