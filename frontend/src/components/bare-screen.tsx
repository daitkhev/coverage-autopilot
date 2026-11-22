import type { ReactNode } from 'react';

import { AppShell, type ShellFrame } from '#components/app-shell';
import { KeyHints } from '#components/key-hints';
import { type Freshness, StatusLine } from '#components/status-line';
import { useKeys } from '#hooks/use-keys';

interface BareScreenProps {
  readonly frame: ShellFrame;
  /** The path to the screen, as the status line says it. */
  readonly path: readonly string[];
  readonly body: ReactNode;
  readonly freshness: Freshness;
  readonly onBack: () => void;
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
  useKeys({ esc: onBack }, { active: true });
  return (
    <AppShell
      {...frame}
      body={body}
      status={<StatusLine path={path} facts={[]} freshness={freshness} />}
      keys={<KeyHints hints={[{ key: 'esc', label: 'back' }]} />}
    />
  );
}
