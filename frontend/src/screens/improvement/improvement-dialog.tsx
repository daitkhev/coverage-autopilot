import type { ReactNode } from 'react';

import type { Improvement } from '@coverage-autopilot/api-contracts/improvements';

import type { ClientSession } from '#api/client-session';
import { improvementStartOf } from '#api/improvement-start';
import { CancelQuestion } from '#components/cancel-question';
import type { KeyHint } from '#components/key-hints';
import { StartDialog } from '#components/start-dialog';
import type { Limits } from '#components/start-limits';

/** A file of a snapshot that a start from this screen is for. */
export interface StartTarget {
  readonly snapshotId: string;
  readonly filePath: string;
  /** The limits of the work asked for again, which the form raises. */
  readonly earlier?: Limits;
}

/** The dialog over the screen: the question before a cancel, or a start. */
export type OpenDialog =
  | { readonly kind: 'cancel' }
  | { readonly kind: 'start'; readonly target: StartTarget };

interface ImprovementDialogProps {
  readonly dialog: OpenDialog;
  readonly session: ClientSession;
  readonly improvement: Improvement;
  /** The work a start began, or the work its refusal names. */
  readonly onStarted: (improvementId: string) => void;
  readonly onClose: () => void;
}

/** The dialog that is open: it takes every key until it closes. */
export function ImprovementDialog({
  dialog,
  session,
  improvement,
  onStarted,
  onClose,
}: ImprovementDialogProps): ReactNode {
  if (dialog.kind === 'cancel') {
    return (
      <CancelQuestion
        improvement={improvement}
        cancel={async () => session.api.cancelImprovement(improvement.id)}
        onClose={onClose}
      />
    );
  }
  const { target } = dialog;
  return (
    <StartDialog
      calls={improvementStartOf(session.api, improvement.repositoryId)}
      snapshotId={target.snapshotId}
      filePath={target.filePath}
      {...(target.earlier === undefined ? {} : { earlier: target.earlier })}
      onOpenImprovement={onStarted}
      onClose={onClose}
    />
  );
}

/** The dialog lists its own keys. The one that always works is here. */
export function dialogHints(dialog: OpenDialog): readonly KeyHint[] {
  return [{ key: 'esc', label: dialog.kind === 'cancel' ? 'keep' : 'close' }];
}

/** What the status line says while a dialog is open. */
export function dialogFacts(dialog: OpenDialog): string[] {
  return dialog.kind === 'cancel'
    ? ['waiting for your answer']
    : [`limits for ${dialog.target.filePath}`];
}
