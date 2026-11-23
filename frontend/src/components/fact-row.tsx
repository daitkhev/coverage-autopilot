import { Box } from 'ink';
import type { ReactNode } from 'react';

import { RoleText } from '#components/role-text';
import { GAP } from '#theme/widths';

/** Wide enough for the longest label of a counter, `Statements`. */
const LABEL_CELLS = 11;

interface FactRowProps {
  readonly label: string;
  readonly children: ReactNode;
}

/**
 * A label in a column of its own and its value beside it, such as
 * `Lines  ━━━┼── 71.4%` or `Worker  alive`.
 */
export function FactRow({ label, children }: FactRowProps): ReactNode {
  return (
    <Box gap={GAP}>
      <Box width={LABEL_CELLS} flexShrink={0}>
        <RoleText role="secondary" truncate>
          {label}
        </RoleText>
      </Box>
      <Box flexGrow={1}>{children}</Box>
    </Box>
  );
}
