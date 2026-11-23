import { Box } from 'ink';
import type { ReactNode } from 'react';

/**
 * Lines that take the room they are given and no more: what does not fit
 * is cut at the bottom, so a long panel never pushes the footer away.
 * The lines keep their own height, so none is squeezed into another.
 */
export function Clipped({
  children,
}: {
  readonly children: ReactNode;
}): ReactNode {
  return (
    <Box flexDirection="column" flexGrow={1} overflow="hidden">
      <Box flexDirection="column" flexShrink={0}>
        {children}
      </Box>
    </Box>
  );
}
