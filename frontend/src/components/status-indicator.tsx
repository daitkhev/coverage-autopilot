import { Text } from 'ink';
import type { ReactNode } from 'react';

import { Glyph } from '#components/glyph';
import { RoleText } from '#components/role-text';
import type { StatusLook } from '#theme/status';

interface StatusIndicatorProps {
  readonly look: StatusLook;
}

/**
 * A symbol and a bold word in the colour of the role, with no background,
 * so it looks the same in a list, in a title and in a sentence.
 */
export function StatusIndicator({ look }: StatusIndicatorProps): ReactNode {
  return (
    <Text>
      <Glyph name={look.glyph} role={look.role} />{' '}
      <RoleText role={look.role} bold>
        {look.word}
      </RoleText>
    </Text>
  );
}
