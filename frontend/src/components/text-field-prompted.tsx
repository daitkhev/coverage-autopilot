import { Text } from 'ink';
import type { ReactNode } from 'react';

import { Glyph } from '#components/glyph';
import { RoleText } from '#components/role-text';
import { useKeys } from '#hooks/use-keys';

interface TextFieldProps {
  /** What stands before the text, such as `/` for a filter. */
  readonly prompt: string;
  readonly value: string;
  /** Whether the field has the keys now. */
  readonly active: boolean;
  readonly onChange: (value: string) => void;
  /** `enter`, which keeps the text. */
  readonly onAccept: () => void;
  /** `esc`, which throws the text away. */
  readonly onDiscard: () => void;
}

/**
 * A line of text the user types into. While it has the keys, letters type
 * and run no action, `enter` accepts and `esc` discards.
 */
export function TextField({
  prompt,
  value,
  active,
  onChange,
  onAccept,
  onDiscard,
}: TextFieldProps): ReactNode {
  useKeys(
    {
      backspace: () => {
        onChange(value.slice(0, -1));
      },
      enter: onAccept,
      esc: onDiscard,
    },
    {
      active,
      onText: (text) => {
        onChange(value + text);
      },
    },
  );
  return (
    <Text wrap="truncate-start">
      <RoleText role="accent">{prompt}</RoleText> {value}
      {active ? <Glyph name="cursor" /> : null}
    </Text>
  );
}
