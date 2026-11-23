import { Box, Text } from 'ink';
import type { ReactNode } from 'react';

import { Glyph } from '#components/glyph';
import { RoleText } from '#components/role-text';
import { useKeys } from '#hooks/use-keys';

interface TextFieldProps {
  /** What stands before the text: `URL`, or `/` for a filter. */
  readonly prompt: string;
  readonly value: string;
  /** Whether the field takes the letters, and shows its cursor. */
  readonly active: boolean;
  readonly onChange: (value: string) => void;
}

/**
 * A prompt and one line of text. Letters type and run no action, and
 * backspace takes the last one back. `enter` and `esc` belong to what
 * holds the field: the dialog, or the list it filters. A text too long
 * for its room keeps its end, and the prompt is never cut.
 */
export function TextField({
  prompt,
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
    <Box gap={1}>
      <Box flexShrink={0}>
        <RoleText role="accent">{prompt}</RoleText>
      </Box>
      <Text wrap="truncate-start">
        {value}
        {active ? <Glyph name="cursor" /> : null}
      </Text>
    </Box>
  );
}
