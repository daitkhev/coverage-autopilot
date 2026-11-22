import type { ReactNode } from 'react';

import type {
  InstallMode,
  Repository,
  RepositoryInstall,
} from '@coverage-autopilot/api-contracts/repositories';

import type { Answer } from '#components/answer-list';
import { Dialog } from '#components/dialog';
import type { KeyHint } from '#components/key-hints';
import { ReplyOutcome } from '#components/outcome-line';
import { RoleText } from '#components/role-text';
import type { Reply } from '#components/unanswered-body';
import { useAction } from '#hooks/use-action';
import type { RepositoryDialogParts } from '#screens/repositories/use-repository-dialog';
import { repositoryName } from '#theme/names';
import { DIALOG_WIDTH } from '#theme/widths';

/**
 * The open dialog of how one repository is installed, and what it does.
 * A mode of `null` gives the default of the service back.
 */
export type TrustDialogParts = RepositoryDialogParts<InstallMode | null>;

/** The keys of the dialog, also for the footer. */
export const TRUST_HINTS: readonly KeyHint[] = [
  { key: 'up-down', label: 'choose' },
  { key: 'enter', label: 'confirm' },
  { key: 'esc', label: 'keep' },
];

/** An answer, and the mode it asks for: none for the one that keeps it. */
interface ModeAnswer extends Answer {
  readonly mode?: InstallMode | null;
}

/** The answer that changes nothing comes first, and is chosen first. */
const ANSWERS: readonly ModeAnswer[] = [
  { label: 'Keep it as it is' },
  { label: 'Sandboxed: its code never has the network', mode: 'sandboxed' },
  { label: 'Trusted: install it as its developers do', mode: 'trusted' },
  { label: 'The default of the service', mode: null },
];

/** How the packages are installed: `trusted, its own`. */
export function installWords(install: RepositoryInstall): string {
  const whose = install.isDefault ? 'the default of the service' : 'its own';
  return `${install.mode}, ${whose}`;
}

/**
 * How the packages of one repository are installed. Trusted lets the code
 * of the repository and of its packages run while the install has the
 * network, so the dialog says what that code can and cannot reach. The
 * dialog closes once the service took the change.
 */
export function TrustDialog({
  repository,
  change,
  onChanged,
  onClose,
}: TrustDialogParts): ReactNode {
  const saving = useAction<Reply<Repository>>();
  const confirm = (answer: number): void => {
    const { mode } = ANSWERS[answer] ?? {};
    if (mode === undefined) {
      onClose();
      return;
    }
    saving.start(async () => {
      const answered = await change(mode);
      if (answered.outcome === 'answered') {
        onChanged(answered.value);
      }
      return answered;
    });
  };
  return (
    <Dialog
      title={`Install of ${repositoryName(repository)}`}
      width={DIALOG_WIDTH.question}
      answers={ANSWERS}
      hints={TRUST_HINTS}
      onConfirm={confirm}
      onClose={onClose}
    >
      <RoleText>{`Its packages are installed ${installWords(repository.install)}.`}</RoleText>
      <RoleText role="secondary">
        Trusted runs the scripts of the repository and of its packages while the
        install has the network: they can send away what is in the copy, but
        they cannot read a credential of this computer.
      </RoleText>
      <ReplyOutcome
        state={saving.state}
        doing="Saving the mode of install"
        request="the mode of install"
      />
    </Dialog>
  );
}
