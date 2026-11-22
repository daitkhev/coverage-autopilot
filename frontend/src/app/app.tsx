import { Box } from 'ink';
import {
  type ReactNode,
  useEffect,
  useEffectEvent,
  useReducer,
  useState,
} from 'react';

import type { ClientSession } from '#api/client-session';
import { type AppCommand, AppPalette } from '#app/app-palette';
import { farewellOf } from '#app/farewell';
import { KeysHelp } from '#app/keys-help';
import {
  FIRST_TRAIL,
  type Move,
  moved,
  sectionOf,
  SECTIONS,
  shownOf,
} from '#app/navigation';
import { type ServiceWatch, useServiceWatch } from '#app/service-watch';
import { ShownScreen } from '#app/shown-screen';
import { Overlay, type ShellFrame } from '#components/app-shell';
import { KeyHints } from '#components/key-hints';
import { TabBar } from '#components/tab-bar';
import { BackdropContext } from '#hooks/use-backdrop';
import type { KeyHandlers } from '#hooks/use-keys';
import { type TerminalLayout, useTerminalSize } from '#hooks/use-terminal-size';

interface AppProps {
  readonly session: ClientSession;
  /** The service is being reached again, after it stopped answering. */
  readonly reviving: boolean;
  /** Nothing answers on the socket any more. */
  readonly onLost: () => void;
  /** Ends the screens, with what to say after them. */
  readonly onQuit: (farewell: string | undefined) => void;
}

/** The dialog of the app that is open over the screen, when one is. */
type AppDialog = 'none' | 'palette' | 'keys';

const TITLE = 'coverage-autopilot';

/** What works in a window too small for the screens. */
const OFFERED_COMMANDS = [
  `${TITLE} list`,
  `${TITLE} status <id>`,
  `${TITLE} --help`,
];

/** The keys of the app, which the footer names where there is room. */
const APP_HINTS = [
  { key: ':', label: 'commands' },
  { key: 'q', label: 'quit' },
  { key: '?', label: 'keys' },
];

const NEEDS_USER_LABEL = 'to review';

/** The commands of the app, each with the key that runs it. */
function commandsOf(app: {
  readonly move: (move: Move) => void;
  readonly show: (dialog: AppDialog) => void;
  readonly quit: () => void;
}): readonly AppCommand[] {
  return [
    ...SECTIONS.map(({ name }, index) => ({
      title: `Go to ${name}`,
      key: String(index + 1),
      run: () => {
        app.move({ kind: 'section', index });
      },
    })),
    {
      title: 'Show the keys',
      key: '?',
      run: () => {
        app.show('keys');
      },
    },
    { title: 'Quit', key: 'q', run: app.quit },
  ];
}

function keysOf(
  commands: readonly AppCommand[],
  openPalette: () => void,
): KeyHandlers {
  return {
    ...Object.fromEntries(commands.map(({ key, run }) => [key, run])),
    ':': openPalette,
  };
}

/** What every screen is handed. The app's keys rest while its dialog is open. */
function frameOf({
  size,
  header,
  keys,
  dialog,
}: {
  readonly size: TerminalLayout;
  readonly header: ReactNode;
  readonly keys: KeyHandlers;
  readonly dialog: AppDialog;
}): ShellFrame {
  return {
    size,
    title: TITLE,
    commands: OFFERED_COMMANDS,
    header,
    help: <KeyHints hints={APP_HINTS} />,
    ...(dialog === 'none' ? { globalKeys: keys } : {}),
  };
}

function Header({
  section,
  watch,
  reviving,
  size,
}: {
  readonly section: number;
  readonly watch: ServiceWatch;
  readonly reviving: boolean;
  readonly size: TerminalLayout;
}): ReactNode {
  return (
    <TabBar
      title={TITLE}
      sections={SECTIONS.map(({ name }) => name)}
      active={section}
      service={reviving ? 'starting' : watch.state}
      layout={size.layout}
      {...(watch.needsUser === 0
        ? {}
        : { waiting: { count: watch.needsUser, label: NEEDS_USER_LABEL } })}
    />
  );
}

/** Tells once that the service stopped answering, each time it does. */
function useLost({ lost }: ServiceWatch, onLost: () => void): void {
  const reachAgain = useEffectEvent(onLost);
  useEffect(() => {
    if (lost) {
      reachAgain();
    }
  }, [lost]);
}

function DialogOver({
  dialog,
  commands,
  size,
  onClose,
}: {
  readonly dialog: AppDialog;
  readonly commands: readonly AppCommand[];
  readonly size: TerminalLayout;
  readonly onClose: () => void;
}): ReactNode {
  if (dialog === 'none') {
    return null;
  }
  return (
    <Overlay size={size}>
      {dialog === 'palette' ? (
        <AppPalette commands={commands} onClose={onClose} />
      ) : (
        <KeysHelp onClose={onClose} />
      )}
    </Overlay>
  );
}

/**
 * The screens of the client: the one that shows, the header over it, and
 * the keys that work on every screen. A dialog of the app is drawn over
 * the screen, which is dim and takes no key until the dialog closes.
 */
export function App({
  session,
  reviving,
  onLost,
  onQuit,
}: AppProps): ReactNode {
  const size = useTerminalSize();
  const [trail, move] = useReducer(moved, FIRST_TRAIL);
  const [dialog, setDialog] = useState<AppDialog>('none');
  const watch = useServiceWatch(session);
  useLost(watch, onLost);
  const commands = commandsOf({
    move,
    show: setDialog,
    quit: () => {
      onQuit(farewellOf(watch.activeWork));
    },
  });
  const header = (
    <Header
      section={sectionOf(trail)}
      watch={watch}
      reviving={reviving}
      size={size}
    />
  );
  const keys = keysOf(commands, () => {
    setDialog('palette');
  });
  return (
    <Box width={size.columns} height={size.rows}>
      <BackdropContext value={dialog !== 'none'}>
        <ShownScreen
          place={shownOf(trail)}
          session={session}
          frame={frameOf({ size, header, keys, dialog })}
          move={move}
        />
      </BackdropContext>
      <DialogOver
        dialog={dialog}
        commands={commands}
        size={size}
        onClose={() => {
          setDialog('none');
        }}
      />
    </Box>
  );
}
