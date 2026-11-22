import type { render } from 'ink-testing-library';
import { createElement } from 'react';
import { expect } from 'vitest';

import type { ServiceApi } from '#api/service-api';
import { App } from '#app/app';
import type { FakeSession } from '#tests/support/fake-service-api';
import { PATIENT } from '#tests/support/keys';
import { wholeSession } from '#tests/support/sample-app-session';
import { WIDE } from '#tests/support/sample-frame';
import { frameOf, renderAt } from '#tests/support/wide-terminal';
import type { TerminalSize } from '#theme/widths';

/** How the app is shown: what the service answers, and the window. */
export interface AppShown {
  readonly scripted?: Partial<ServiceApi>;
  readonly size?: TerminalSize;
  readonly reviving?: boolean;
}

/** The app in a terminal, its session, and what it told its caller. */
export interface ShownApp {
  readonly terminal: ReturnType<typeof render>;
  readonly session: FakeSession;
  readonly log: {
    lost: number;
    readonly farewells: (string | undefined)[];
  };
}

/** The whole app over a service that answers every screen. */
export function showApp({
  scripted = {},
  size = WIDE,
  reviving = false,
}: AppShown = {}): ShownApp {
  const session = wholeSession(scripted);
  const log: ShownApp['log'] = { lost: 0, farewells: [] };
  const app = createElement(App, {
    session,
    reviving,
    onLost: () => {
      log.lost += 1;
    },
    onQuit: (farewell) => {
      log.farewells.push(farewell);
    },
  });
  return { terminal: renderAt(app, size), session, log };
}

/** The app, once the header says that the service answers. */
export async function openedApp(shown: AppShown = {}): Promise<ShownApp> {
  const app = showApp(shown);
  await expect
    .poll(() => frameOf(app.terminal), PATIENT)
    .toContain('service up');
  return app;
}

/** How many times the app asked the service one thing. */
export function askedOf(app: ShownApp, method: keyof ServiceApi): number {
  return app.session.api.calls.filter((call) => call.method === method).length;
}
