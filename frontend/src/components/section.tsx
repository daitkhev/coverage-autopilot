import { Box, Text } from 'ink';
import type { ReactNode } from 'react';

import { RoleText } from '#components/role-text';
import { Rule } from '#components/rule';

interface SectionProps {
  /** A short heading, such as "WHAT TO DO". */
  readonly title: string;
  readonly children: ReactNode;
}

/** A part of a panel: a bold heading, a rule after it, and its lines. */
export function Section({ title, children }: SectionProps): ReactNode {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text>
          <RoleText role="emphasis">{title}</RoleText>{' '}
        </Text>
        <Rule />
      </Box>
      {children}
    </Box>
  );
}
