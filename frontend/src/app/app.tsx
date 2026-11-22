import { Box } from 'ink';
import {
  type ReactNode,
  useEffect,
  useEffectEvent,
  useReducer,
  useState,
} from 'react';

import type { ClientSession } from '#api/client-session';
import { AppPalette } from '#app/app-palette';
import { farewellOf } from '#app/farewell';
import { KeysHelp } from '#app/keys-help';
import { FIRST_JOURNEY, type Move, moved, SECTIONS } from '#app/navigation';
import { type ServiceWatch, useServiceWatch } from '#app/service-watch';
import { ShownScreen } from '#app/shown-screen';
import { Overlay, type ShellFrame } from '#components/app-shell';
import { hintsOf, KeyHints } from '#components/key-hints';
import { TabBar } from '#components/tab-bar';
import { BackdropContext } from '#hooks/use-backdrop';
import { useKeys } from '#hooks/use-keys';
import {
  keysOf,
  type OfferedActions,
  offeredActions,
  OfferedContext,
  type ScreenAction,
} from '#hooks/use-screen-actions';
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

const NEEDS_USER_LABEL = 'to review';

/**
 * The actions of the app, which work on every screen: the sections, the
 * list of commands, quitting and the keys. The footer names some of them
 * where there is room, and the list of commands names the others.
 */
function appActionsOf(app: {
  readonly move: (move: Move) => void;
  readonly show: (dialog: AppDialog) => void;
  readonly quit: () => void;
}): ScreenAction[] {
  return [
    ...SECTIONS.map(({ name }, index) => ({
      key: String(index + 1),
      run: () => {
        app.move({ kind: 'section', index });
      },
      command: { title: `Go to ${name}` },
    })),
    {
      key: ':',
      run: () => {
        app.show('palette');
      },
      hint: { label: 'commands' },
    },
    {
      key: 'q',
      run: app.quit,
      hint: { label: 'quit' },
      command: { title: 'Quit' },
    },
    {
      key: '?',
      run: () => {
        app.show('keys');
      },
      hint: { label: 'keys' },
      command: { title: 'Show the keys' },
    },
  ];
}

/** What every screen is handed. The app's keys rest while its dialog is open. */
function frameOf({
  size,
  header,
  actions,
  dialog,
}: {
  readonly size: TerminalLayout;
  readonly header: ReactNode;
  readonly actions: readonly ScreenAction[];
  readonly dialog: AppDialog;
}): ShellFrame {
  return {
    size,
    title: TITLE,
    commands: OFFERED_COMMANDS,
    header,
    help: <KeyHints hints={hintsOf(actions)} />,
    ...(dialog === 'none' ? { globalKeys: keysOf(actions) } : {}),
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
  offers,
  actions,
  size,
  onClose,
}: {
  readonly dialog: AppDialog;
  readonly offers: OfferedActions;
  readonly actions: readonly ScreenAction[];
  readonly size: TerminalLayout;
  readonly onClose: () => void;
}): ReactNode {
  if (dialog === 'none') {
    return null;
  }
  return (
    <Overlay size={size}>
      {dialog === 'palette' ? (
        <AppPalette offers={offers} app={actions} onClose={onClose} />
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
  const [journey, move] = useReducer(moved, FIRST_JOURNEY);
  const [dialog, setDialog] = useState<AppDialog>('none');
  const [offers] = useState(offeredActions);
  const watch = useServiceWatch(session);
  useLost(watch, onLost);
  const quit = (): void => {
    onQuit(farewellOf(watch.activeWork));
  };
  const actions = appActionsOf({ move, show: setDialog, quit });
  const header = (
    <Header
      section={journey.section}
      watch={watch}
      reviving={reviving}
      size={size}
    />
  );
  // Also over a dialog and in a text field, where `q` is a letter.
  useKeys({ 'ctrl+c': quit }, { active: true });
  return (
    <Box width={size.columns} height={size.rows}>
      <BackdropContext value={dialog !== 'none'}>
        <OfferedContext value={offers}>
          <ShownScreen
            journey={journey}
            session={session}
            frame={frameOf({ size, header, actions, dialog })}
            move={move}
          />
        </OfferedContext>
      </BackdropContext>
      <DialogOver
        dialog={dialog}
        offers={offers}
        actions={actions}
        size={size}
        onClose={() => {
          setDialog('none');
        }}
      />
    </Box>
  );
}
