import { Box, Text } from 'ink';
import type { ReactNode } from 'react';

import { Glyph } from '#components/glyph';
import { RoleText } from '#components/role-text';
import { useKeys } from '#hooks/use-keys';
import { GAP } from '#theme/widths';

interface TextFieldProps {
  readonly label: string;
  readonly value: string;
  /** Whether the field takes the letters, and shows its cursor. */
  readonly active: boolean;
  readonly onChange: (value: string) => void;
}

/**
 * A label and one line of text. Letters type and run no action, and
 * backspace takes the last one back. `enter` and `esc` belong to the
 * dialog the field is in. A text too long for its room keeps its end.
 */
export function TextField({
  label,
  value,
  active,
  onChange,
}: TextFieldProps): ReactNode {
  useKeys(
    {
      backspace: () => {
        onChange(value.slice(0, -1));
      },
    },
    {
      active,
      onText: (text) => {
        onChange(value + text);
      },
    },
  );
  return (
    <Box gap={GAP}>
      <Box flexShrink={0}>
        <RoleText role="secondary">{label}</RoleText>
      </Box>
      <Text wrap="truncate-start">
        {value}
        {active ? <Glyph name="cursor" /> : null}
      </Text>
    </Box>
  );
}
