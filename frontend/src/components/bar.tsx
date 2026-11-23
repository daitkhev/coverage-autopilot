import { Box, Text } from 'ink';
import type { ReactNode } from 'react';

import { RoleText } from '#components/role-text';
import { useTheme } from '#hooks/use-theme';
import { BAR_PARTS, barRunsOf, type BarShape } from '#theme/bars';
import type { Role } from '#theme/roles';
import { symbolOf } from '#theme/symbols';

interface BarProps {
  readonly shape: BarShape;
  /** The role of the filled part. */
  readonly role: Role;
}

/** A bar drawn as one thin line, with a tick where the shape has one. */
export function Bar({ shape, role }: BarProps): ReactNode {
  const settings = useTheme();
  return (
    <Box flexShrink={0}>
      <Text>
        {barRunsOf(shape).map((run, index) => {
          const part = BAR_PARTS[run.part];
          return (
            <RoleText
              key={`${run.part}-${String(index)}`}
              role={part.role ?? role}
            >
              {symbolOf(part.glyph, settings).repeat(run.length)}
            </RoleText>
          );
        })}
      </Text>
    </Box>
  );
}
