import type { ReactNode } from 'react';

import { AppShell, type ShellFrame } from '#components/app-shell';
import { hintsOf, KeyHints } from '#components/key-hints';
import { type Freshness, StatusLine } from '#components/status-line';
import { type NamedAction, useScreenActions } from '#hooks/use-screen-actions';

interface BareScreenProps {
  readonly frame: ShellFrame;
  /** The path to the screen, as the status line says it. */
  readonly path: readonly string[];
  readonly body: ReactNode;
  readonly freshness: Freshness;
  readonly onBack: () => void;
}

/** `esc`, which goes back to the screen this one was opened from. */
export function backAction(onBack: () => void): NamedAction {
  return {
    key: 'esc',
    run: onBack,
    hint: { label: 'back' },
    command: { title: 'Go back' },
  };
}

/**
 * A screen with nothing to act on yet: its answer is on its way, was
 * refused, or holds nothing. It offers only the way back.
 */
export function BareScreen({
  frame,
  path,
  body,
  freshness,
  onBack,
}: BareScreenProps): ReactNode {
  const actions = [backAction(onBack)];
  useScreenActions(actions, { active: true });
  return (
    <AppShell
      {...frame}
      body={body}
      status={<StatusLine path={path} facts={[]} freshness={freshness} />}
      keys={<KeyHints hints={hintsOf(actions)} />}
    />
  );
}
