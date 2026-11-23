import { type ReactNode, useState } from 'react';

import {
  CommandPalette,
  type PaletteCommand,
} from '#components/command-palette';
import {
  type OfferedActions,
  type ScreenAction,
  useOfferedActions,
} from '#hooks/use-screen-actions';

/** A line of the palette, and what it runs. */
interface PaletteLine extends PaletteCommand {
  readonly run: () => void;
}

interface AppPaletteProps {
  /** What the screen that shows offers now. */
  readonly offers: OfferedActions;
  /** The commands of the app, which work on every screen. */
  readonly app: readonly ScreenAction[];
  readonly onClose: () => void;
}

/**
 * The rows of the list that show at once. With the query, the rule, the
 * keys, the frame and "more below" around them, the dialog fits in a
 * window of the smallest height, and a longer list scrolls inside it.
 */
const VISIBLE_COMMANDS = 8;

const HINTS = [
  { key: 'up-down', label: 'choose' },
  { key: 'enter', label: 'run' },
  { key: 'esc', label: 'close' },
];

/** The actions the palette names, with the key that runs each, if any. */
function linesOf(actions: readonly ScreenAction[]): PaletteLine[] {
  return actions.flatMap(({ key, run, command }) =>
    command === undefined
      ? []
      : [{ ...command, ...(key === undefined ? {} : { key }), run }],
  );
}

function matching(
  lines: readonly PaletteLine[],
  query: string,
): readonly PaletteLine[] {
  const wanted = query.trim().toLowerCase();
  return lines.filter(({ title }) => title.toLowerCase().includes(wanted));
}

/**
 * The dialog of `:`: what the screen that shows can do now, then the
 * commands of the app, narrowed by what is typed. It follows the screen,
 * so an action that stops working leaves the list. A command closes the
 * dialog before it runs, so what it opens has the keys.
 */
export function AppPalette({
  offers,
  app,
  onClose,
}: AppPaletteProps): ReactNode {
  const [query, setQuery] = useState('');
  const screen = useOfferedActions(offers);
  const shown = matching([...linesOf(screen), ...linesOf(app)], query);
  return (
    <CommandPalette
      query={query}
      commands={shown}
      visible={VISIBLE_COMMANDS}
      hints={HINTS}
      onQuery={setQuery}
      onRun={(chosen) => {
        onClose();
        shown.find((line) => line === chosen)?.run();
      }}
      onClose={onClose}
    />
  );
}
