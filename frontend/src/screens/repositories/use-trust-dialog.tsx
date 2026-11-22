import type {
  InstallMode,
  Repository,
} from '@coverage-autopilot/api-contracts/repositories';

import type { ClientSession } from '#api/client-session';
import {
  type RepositoryDialog,
  useRepositoryDialog,
} from '#screens/repositories/use-repository-dialog';

/**
 * The dialog of how a repository is installed, and the key that opens
 * it. A mode of `null` gives the default back.
 */
export type TrustDialog = RepositoryDialog<InstallMode | null>;

interface TrustDialogOptions {
  readonly session: ClientSession;
  readonly onChanged: (repository: Repository) => void;
}

/** The repository whose mode of install the dialog changes. */
export function useTrustDialog({
  session,
  onChanged,
}: TrustDialogOptions): TrustDialog {
  return useRepositoryDialog({
    change: async (repository, mode: InstallMode | null) =>
      session.api.changeInstallMode(repository.id, { mode }),
    onChanged,
  });
}
