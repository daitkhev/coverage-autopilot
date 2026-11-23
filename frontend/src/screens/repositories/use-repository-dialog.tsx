import { useState } from 'react';

import type { Repository } from '@coverage-autopilot/api-contracts/repositories';

import type { Reply } from '#components/unanswered-body';

/** The open dialog of one choice for one repository, and what it does. */
export interface RepositoryDialogParts<Choice> {
  readonly repository: Repository;
  /** One change for one confirmation. */
  readonly change: (choice: Choice) => Promise<Reply<Repository>>;
  readonly onChanged: (repository: Repository) => void;
  readonly onClose: () => void;
}

/** The dialog of a choice for a repository, and the key that opens it. */
export interface RepositoryDialog<Choice> {
  /** Nothing while the dialog is closed. */
  readonly parts: RepositoryDialogParts<Choice> | undefined;
  readonly open: (repository: Repository) => void;
}

interface RepositoryDialogOptions<Choice> {
  /** Sends the choice for the repository to the service. */
  readonly change: (
    repository: Repository,
    choice: Choice,
  ) => Promise<Reply<Repository>>;
  readonly onChanged: (repository: Repository) => void;
}

/**
 * The repository whose choice the dialog changes. The dialog closes once
 * the service took the change, and the list shows it on its next request.
 */
export function useRepositoryDialog<Choice>({
  change,
  onChanged,
}: RepositoryDialogOptions<Choice>): RepositoryDialog<Choice> {
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
            change: async (choice) => change(repository, choice),
            onChanged: (changed) => {
              close();
              onChanged(changed);
            },
            onClose: close,
          },
    open: setRepository,
  };
}
