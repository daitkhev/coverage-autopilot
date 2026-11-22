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
}

/**
 * Shows the screens in the terminal until the user quits, and gives back
 * what the client says after them, when it has something to say.
 */
export async function runScreens({
  terminal,
  theme,
  reach,
  sessionOf,
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
    // The client writes nothing to the console, so Ink need not guard it.
    // And the client was given a terminal, so Ink is told to draw on it:
    // left to itself it reads the environment and draws nothing under CI.
    { ...terminal, patchConsole: false, interactive: true },
  );
  await ink.waitUntilExit();
  return farewell;
}
