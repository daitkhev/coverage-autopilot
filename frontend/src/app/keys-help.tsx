import { Box } from 'ink';
import type { ReactNode } from 'react';

import { Dialog } from '#components/dialog';
import { RoleText } from '#components/role-text';
import { DIALOG_WIDTH, GAP } from '#theme/widths';

/** The keys table of the design: where the focus is decides which work. */
const KEYS: readonly (readonly [string, string])[] = [
  ['Anywhere', '1 2 3 sections, : commands, ? keys, q quit'],
  ['', 'esc back'],
  ['A list', 'up down or j k one row, pgup pgdn one page'],
  ['', 'g G first and last, enter open, / filter'],
  ['', 'tab details'],
  ['Details', 'up down scroll, tab back to the list'],
  ['A question', 'up down choose, 1 to 9 pick, enter confirm'],
  ['', 'esc close'],
  ['A text field', 'letters type, enter accepts, esc discards'],
  ['Work that ends', 'c cancel, which always asks first'],
];

/** The widest place of the table, and the gap after it. */
const WHERE_CELLS = 16;

/** The dialog of `?`: every key, by the place it works in. */
export function KeysHelp({
  onClose,
}: {
  readonly onClose: () => void;
}): ReactNode {
  return (
    <Dialog
      title="Keys"
      width={DIALOG_WIDTH.palette}
      hints={[{ key: 'esc', label: 'close' }]}
      onConfirm={onClose}
      onClose={onClose}
    >
      {KEYS.map(([where, keys]) => (
        <Box key={`${where} ${keys}`} gap={GAP}>
          <Box width={WHERE_CELLS} flexShrink={0}>
            <RoleText role="secondary">{where}</RoleText>
          </Box>
          <RoleText>{keys}</RoleText>
        </Box>
      ))}
    </Dialog>
  );
}
