import { Text } from 'ink';
import type { ReactNode } from 'react';

import { useBackdrop } from '#hooks/use-backdrop';
import { useTheme } from '#hooks/use-theme';
import { type Role, textStyleOf } from '#theme/roles';

interface RoleTextProps {
  readonly role?: Role;
  readonly bold?: boolean;
  /** One line that is cut at its end, where wrapping would add rows. */
  readonly truncate?: boolean;
  readonly children: ReactNode;
}

/** A text in the style of its role. Behind a dialog it is drawn dim. */
export function RoleText({
  role = 'primary',
  bold = false,
  truncate = false,
  children,
}: RoleTextProps): ReactNode {
  const style = textStyleOf(role, useTheme());
  const behind = useBackdrop();
  return (
    <Text
      {...style}
      bold={style.bold || bold}
      dimColor={style.dimColor || behind}
      wrap={truncate ? 'truncate-end' : 'wrap'}
    >
      {children}
    </Text>
  );
}
