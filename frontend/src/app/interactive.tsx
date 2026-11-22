import { render } from 'ink';

import type { ClientSession } from '#api/client-session';
import type { ServiceApi } from '#api/service-api';
import { Client, type Reach } from '#app/client';
import { ThemeContext } from '#hooks/use-theme';
import type { ThemeSettings } from '#theme/settings';

/** The two ends of the terminal the screens are drawn in. */
export interface Terminal {
  readonly stdout: NodeJS.WriteStream;
  readonly stdin: NodeJS.ReadStream;
}

interface Screens {
  readonly terminal: Terminal;
  readonly theme: ThemeSettings;
  readonly reach: Reach;
  readonly sessionOf: (api: ServiceApi) => ClientSession;
  /** Aborted when the client must leave at once, as on a signal. */
  readonly leave: AbortSignal;
}

/**
 * Shows the screens in the terminal until the user quits or the client
 * must leave, and gives back what the client says after them, when the
 * user quit and it has something to say. The caller prints it: what is
 * drawn on the screens goes with them.
 */
export async function runScreens({
  terminal,
  theme,
  reach,
  sessionOf,
  leave,
}: Screens): Promise<string | undefined> {
  let farewell: string | undefined;
  const ink = render(
    <ThemeContext value={theme}>
      <Client
        reach={reach}
        sessionOf={sessionOf}
        onQuit={(said) => {
          farewell = said;
          ink.unmount();
        }}
      />
    </ThemeContext>,
    {
      ...terminal,
      // The client writes nothing to the console, so Ink need not guard it.
      patchConsole: false,
      // The client was given a terminal, so Ink is told to draw on it:
      // left to itself it reads the environment and draws nothing under CI.
      interactive: true,
      // The screens take the whole terminal and give it back as it was, so
      // nothing of the shell shows around them or can be scrolled into.
      alternateScreen: true,
      // Ctrl+C is a key of the client, which leaves as `q` does.
      exitOnCtrlC: false,
    },
  );
  // The terminal is given back as on `q`, before what runs is stopped.
  leave.addEventListener(
    'abort',
    () => {
      ink.unmount();
    },
    { once: true },
  );
  await ink.waitUntilExit();
  return farewell;
}
