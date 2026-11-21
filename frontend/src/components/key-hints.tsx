import { Box, Text } from 'ink';
import { Fragment, type ReactNode } from 'react';

import { Glyph } from '#components/glyph';
import { RoleText } from '#components/role-text';
import { useTheme } from '#hooks/use-theme';
import type { Role } from '#theme/roles';
import { keyTextOf } from '#theme/symbols';
import { GAP, KEY_GAP } from '#theme/widths';

/** A key and what it does now, such as `enter` open. */
export interface KeyHint {
  readonly key: string;
  readonly label: string;
  /** A key whose action cannot be undone, such as `c` cancel, is red. */
  readonly role?: Role;
  /** Why the action cannot be used now. The footer never lists such a key. */
  readonly inactive?: string;
}

interface KeyHintsProps {
  readonly hints: readonly KeyHint[];
  /** In a dialog the keys are joined by a dot, in the footer by space. */
  readonly joined?: boolean;
}

function Hint({ hint }: { readonly hint: KeyHint }): ReactNode {
  const active = hint.inactive === undefined;
  const keyRole = active ? (hint.role ?? 'primary') : 'secondary';
  return (
    <Box gap={GAP}>
      <Text>
        <RoleText role={keyRole} bold={active}>
          {keyTextOf(hint.key, useTheme())}
        </RoleText>{' '}
        <RoleText role="secondary">{hint.label}</RoleText>
      </Text>
      {active ? null : <RoleText role="secondary">{hint.inactive}</RoleText>}
    </Box>
  );
}

/** The keys of the footer, or of a dialog. */
export function KeyHints({ hints, joined = false }: KeyHintsProps): ReactNode {
  return (
    <Box gap={joined ? 1 : KEY_GAP}>
      {hints.map((hint, index) => (
        <Fragment key={`${hint.key} ${hint.label}`}>
          {joined && index > 0 ? (
            <Glyph name="separator" role="secondary" />
          ) : null}
          <Hint hint={hint} />
        </Fragment>
      ))}
    </Box>
  );
}
