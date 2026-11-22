import { type ReactNode, useState } from 'react';

import {
  CommandPalette,
  type PaletteCommand,
} from '#components/command-palette';

/** A command of the palette, and what it does. */
export interface AppCommand extends PaletteCommand {
  /** The key that runs it on every screen. */
  readonly key: string;
  readonly run: () => void;
}

interface AppPaletteProps {
  readonly commands: readonly AppCommand[];
  readonly onClose: () => void;
}

/** The rows of the list that show at once. */
const VISIBLE_COMMANDS = 8;

const HINTS = [
  { key: 'enter', label: 'run' },
  { key: 'esc', label: 'close' },
];

function matching(
  commands: readonly AppCommand[],
  query: string,
): readonly AppCommand[] {
  const wanted = query.trim().toLowerCase();
  return commands.filter(({ title }) => title.toLowerCase().includes(wanted));
}

/**
 * The dialog of `:`: the commands of the app, narrowed by what is typed.
 * A command closes the dialog before it runs, so what it opens has the
 * keys.
 */
export function AppPalette({ commands, onClose }: AppPaletteProps): ReactNode {
  const [query, setQuery] = useState('');
  const shown = matching(commands, query);
  return (
    <CommandPalette
      query={query}
      commands={shown}
      visible={VISIBLE_COMMANDS}
      hints={HINTS}
      onQuery={setQuery}
      onRun={(chosen) => {
        onClose();
        shown.find(({ title }) => title === chosen.title)?.run();
      }}
      onClose={onClose}
    />
  );
}
