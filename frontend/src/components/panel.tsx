import { Box, Text } from 'ink';
import type { ReactNode } from 'react';

import { RoleText } from '#components/role-text';
import { Rule } from '#components/rule';
import { useBorder } from '#hooks/use-border';
import { useTheme } from '#hooks/use-theme';
import type { Role } from '#theme/roles';
import { frameOf } from '#theme/symbols';

/** A frame that warns: yellow, or red for failed work. */
export type PanelTone = 'warning' | 'danger';

interface PanelProps {
  readonly title: string;
  /** Beside the title, such as the number of rows or the id. */
  readonly note?: string;
  readonly focused: boolean;
  readonly tone?: PanelTone;
  readonly children: ReactNode;
}

interface Edge {
  readonly role: Role;
  readonly title: Role;
  readonly bold: boolean;
}

function edgeOf({
  focused,
  tone,
}: {
  readonly focused: boolean;
  readonly tone: PanelTone | undefined;
}): Edge {
  if (tone !== undefined) {
    return { role: tone, title: tone, bold: true };
  }
  return focused
    ? { role: 'accent', title: 'accent', bold: true }
    : { role: 'border', title: 'primary', bold: false };
}

/**
 * A rounded border with the title in its top edge. A focused panel has a
 * magenta border and a bold magenta title.
 */
export function Panel({
  title,
  note,
  focused,
  tone,
  children,
}: PanelProps): ReactNode {
  const frame = frameOf(useTheme());
  const edge = edgeOf({ focused, tone });
  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box>
        <Box flexShrink={0}>
          <RoleText
            role={edge.role}
          >{`${frame.topLeft}${frame.line} `}</RoleText>
        </Box>
        <RoleText role={edge.title} bold={edge.bold} truncate>
          {title}
        </RoleText>
        <Box flexShrink={0}>
          <Text>
            {note === undefined ? null : <RoleText>{` ${note}`}</RoleText>}{' '}
          </Text>
        </Box>
        <Rule role={edge.role} />
        {/* A box, because a text that starts between two cells is moved
            left to a whole one, onto the end of the line before it. */}
        <Box flexShrink={0}>
          <RoleText role={edge.role}>{frame.topRight}</RoleText>
        </Box>
      </Box>
      <Box
        flexDirection="column"
        flexGrow={1}
        borderStyle={frame.box}
        borderTop={false}
        paddingX={1}
        {...useBorder(edge.role)}
      >
        {children}
      </Box>
    </Box>
  );
}
