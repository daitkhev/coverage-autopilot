import { Box } from 'ink';
import type { ReactNode } from 'react';

import { type Layout, LEFT_PANEL_SHARE } from '#theme/widths';

interface SplitViewProps {
  readonly layout: Layout;
  /** The list, and the selected item in a second panel. */
  readonly left: ReactNode;
  readonly right: ReactNode;
  /** In one panel, which of the two is in its place. */
  readonly shown: 'left' | 'right';
}

/**
 * Two panels side by side, narrower below 110 columns. Below 90 there is
 * room for one, and `→` opens the selected item in place of the list.
 */
export function SplitView({
  layout,
  left,
  right,
  shown,
}: SplitViewProps): ReactNode {
  if (layout === 'narrow' || layout === 'too-small') {
    return (
      <Box flexGrow={1} flexDirection="column">
        {shown === 'left' ? left : right}
      </Box>
    );
  }
  return (
    <Box flexGrow={1} gap={1}>
      <Box width={LEFT_PANEL_SHARE} flexShrink={0} flexDirection="column">
        {left}
      </Box>
      <Box flexGrow={1} flexDirection="column">
        {right}
      </Box>
    </Box>
  );
}
