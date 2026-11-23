import { Box } from 'ink';
import type { ReactNode } from 'react';

import { Glyph } from '#components/glyph';
import { RoleText } from '#components/role-text';
import { GAP } from '#theme/widths';

/** How a row is drawn: the chosen row of the focused list is bold. */
export interface RowState {
  readonly selected: boolean;
  readonly bold: boolean;
}

interface DataListProps<Item> {
  readonly items: readonly Item[];
  /** The chosen row and the first drawn row, from the selection. */
  readonly selected: number;
  readonly offset: number;
  /** How many rows fit. */
  readonly visible: number;
  readonly focused: boolean;
  readonly keyOf: (item: Item) => string;
  readonly renderRow: (item: Item, state: RowState) => ReactNode;
  /** The names of the columns, drawn above the rows. */
  readonly header?: ReactNode;
}

/** How many rows a long list has below the last one drawn, if any. */
export function MoreBelow({ count }: { readonly count: number }): ReactNode {
  return count > 0 ? (
    <Box paddingLeft={GAP}>
      <RoleText role="secondary">{`${String(count)} more below`}</RoleText>
    </Box>
  ) : null;
}

function Marker({
  selected,
  focused,
}: {
  readonly selected: boolean;
  readonly focused: boolean;
}): ReactNode {
  return (
    <Box width={GAP} flexShrink={0}>
      {selected ? (
        <Glyph name="selected" role={focused ? 'accent' : 'secondary'} />
      ) : null}
    </Box>
  );
}

/**
 * Rows with a selection and a scroll position. The chosen row has `›`, in
 * magenta while the list has the focus, and "more below" ends a long list.
 */
export function DataList<Item>(props: DataListProps<Item>): ReactNode {
  const { items, selected, offset, visible, focused } = props;
  const below = items.length - offset - visible;
  return (
    <Box flexDirection="column">
      {props.header === undefined ? null : (
        <Box paddingLeft={GAP}>{props.header}</Box>
      )}
      {items.slice(offset, offset + visible).map((item, index) => {
        const chosen = offset + index === selected;
        return (
          <Box key={props.keyOf(item)}>
            <Marker selected={chosen} focused={focused} />
            <Box flexGrow={1} flexDirection="column">
              {props.renderRow(item, {
                selected: chosen,
                bold: chosen && focused,
              })}
            </Box>
          </Box>
        );
      })}
      <MoreBelow count={below} />
    </Box>
  );
}
