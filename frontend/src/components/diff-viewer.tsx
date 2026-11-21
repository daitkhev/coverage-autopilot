import { Box, Text } from 'ink';
import type { ReactNode } from 'react';

import { Glyph } from '#components/glyph';
import { RoleText } from '#components/role-text';
import { GAP } from '#theme/widths';

interface DiffViewerProps {
  /** The added lines of the patch, the first one being line 1. */
  readonly lines: readonly string[];
  /** The first drawn line, from the scroll position, and how many fit. */
  readonly offset: number;
  readonly visible: number;
}

/**
 * The added lines of a patch with their numbers. An added line has a green
 * `+` and no background, so the code stays easy to read.
 */
export function DiffViewer({
  lines,
  offset,
  visible,
}: DiffViewerProps): ReactNode {
  const numberCells = String(lines.length).length + GAP;
  const below = lines.length - offset - visible;
  return (
    <Box flexDirection="column">
      {lines.slice(offset, offset + visible).map((line, index) => {
        const number = offset + index + 1;
        return (
          <Box key={number}>
            <Box width={numberCells} flexShrink={0} justifyContent="flex-end">
              <RoleText role="secondary">{String(number)}</RoleText>
            </Box>
            <Box flexShrink={0} paddingX={1}>
              <Glyph name="added" role="success" />
            </Box>
            <Text wrap="truncate-end">{line}</Text>
          </Box>
        );
      })}
      {below > 0 ? (
        <Box paddingLeft={numberCells + GAP + 1}>
          <RoleText role="secondary">{`${String(below)} more lines below`}</RoleText>
        </Box>
      ) : null}
    </Box>
  );
}
