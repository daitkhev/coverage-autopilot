import type { Repository } from '@coverage-autopilot/api-contracts/repositories';

import type { ClientSession } from '#api/client-session';
import {
  type RepositoryDialog,
  useRepositoryDialog,
} from '#screens/repositories/use-repository-dialog';

/**
 * The dialog of the threshold of a repository, and the key that opens it.
 * A percentage of `null` gives the default back.
 */
export type ThresholdDialog = RepositoryDialog<number | null>;

interface ThresholdDialogOptions {
  readonly session: ClientSession;
  readonly onChanged: (repository: Repository) => void;
}

/** The repository whose threshold the dialog changes. */
export function useThresholdDialog({
  session,
  onChanged,
}: ThresholdDialogOptions): ThresholdDialog {
  return useRepositoryDialog({
    change: async (repository, percentage: number | null) =>
      session.api.changeThreshold(repository.id, { percentage }),
    onChanged,
  });
}
