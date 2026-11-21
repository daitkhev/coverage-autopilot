import { Box, Text } from 'ink';
import type { ReactNode } from 'react';

import { DataList } from '#components/data-list';
import { Dialog } from '#components/dialog';
import { Glyph } from '#components/glyph';
import type { KeyHint } from '#components/key-hints';
import { RoleText } from '#components/role-text';
import { Rule } from '#components/rule';
import { type KeyHandlers, useKeys } from '#hooks/use-keys';
import { type Selection, useSelection } from '#hooks/use-selection';
import { COMMAND_TITLE_SHARE, DIALOG_WIDTH, GAP } from '#theme/widths';

/** An action of a screen, what it acts on, and its own key if it has one. */
export interface PaletteCommand {
  readonly title: string;
  readonly target?: string;
  readonly key?: string;
}

interface CommandPaletteProps {
  readonly query: string;
  /** The commands that match the query, filtered by the caller. */
  readonly commands: readonly PaletteCommand[];
  readonly visible: number;
  readonly hints: readonly KeyHint[];
  readonly onQuery: (query: string) => void;
  readonly onRun: (command: PaletteCommand) => void;
  readonly onClose: () => void;
}

function CommandRow({
  command,
  bold,
}: {
  readonly command: PaletteCommand;
  readonly bold: boolean;
}): ReactNode {
  return (
    <Box gap={GAP}>
      <Box width={COMMAND_TITLE_SHARE} flexShrink={0}>
        <RoleText bold={bold} truncate>
          {command.title}
        </RoleText>
      </Box>
      <Box flexGrow={1}>
        <RoleText truncate>{command.target ?? ''}</RoleText>
      </Box>
      <RoleText role="emphasis">{command.key ?? ''}</RoleText>
    </Box>
  );
}

/** The arrows choose a command, and backspace takes a letter back. */
function keysOf(
  selection: Selection,
  { query, onQuery }: CommandPaletteProps,
): KeyHandlers {
  return {
    up: () => {
      selection.moveBy(-1);
    },
    down: () => {
      selection.moveBy(1);
    },
    backspace: () => {
      onQuery(query.slice(0, -1));
    },
  };
}

function QueryField({ query }: { readonly query: string }): ReactNode {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text>
        <RoleText role="accent">:</RoleText> {query}
        <Glyph name="cursor" />
      </Text>
      <Rule />
    </Box>
  );
}

/**
 * The list of commands, filtered as the user types. Every action of every
 * screen is in it, so nothing depends on remembering a key.
 */
export function CommandPalette(props: CommandPaletteProps): ReactNode {
  const { query, commands } = props;
  const selection = useSelection({
    count: commands.length,
    visible: props.visible,
  });
  useKeys(keysOf(selection, props), {
    active: true,
    onText: (text) => {
      props.onQuery(query + text);
    },
  });
  const run = (): void => {
    const command = commands[selection.index];
    if (command !== undefined) {
      props.onRun(command);
    }
  };
  return (
    <Dialog
      title="Commands"
      width={DIALOG_WIDTH.palette}
      hints={props.hints}
      onConfirm={run}
      onClose={props.onClose}
    >
      <QueryField query={query} />
      <DataList
        items={commands}
        selected={selection.index}
        offset={selection.offset}
        visible={props.visible}
        focused
        keyOf={(command) => `${command.title} ${command.target ?? ''}`}
        renderRow={(command, row) => (
          <CommandRow command={command} bold={row.bold} />
        )}
      />
    </Dialog>
  );
}
