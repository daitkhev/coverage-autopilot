import { Box } from 'ink';
import type { ReactNode } from 'react';

import { useBorder } from '#hooks/use-border';
import { useTheme } from '#hooks/use-theme';
import type { Role } from '#theme/roles';
import { frameOf } from '#theme/symbols';

/** A thin line that fills the rest of its row. */
export function Rule({ role = 'border' }: { readonly role?: Role }): ReactNode {
  return (
    <Box
      flexGrow={1}
      borderStyle={frameOf(useTheme()).rule}
      borderBottom={false}
      borderLeft={false}
      borderRight={false}
      {...useBorder(role)}
    />
  );
}
