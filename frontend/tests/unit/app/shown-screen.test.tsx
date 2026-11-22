import { cleanup } from 'ink-testing-library';
import { afterEach, describe, expect, it } from 'vitest';

import type { Repository } from '@coverage-autopilot/api-contracts/repositories';

import { answered } from '#tests/support/fake-service-api';
import { KEYS, PATIENT, press } from '#tests/support/keys';
import { askedOf, openedApp, type ShownApp } from '#tests/support/sample-app';
import { REPOSITORY_LIST } from '#tests/support/sample-repositories';
import { frameOf } from '#tests/support/wide-terminal';

const FILES_PATH = 'Repositories › example/payments';
const IMPROVEMENT = 'Improvement improvement-sum';

/** Waits until the terminal shows a text. */
async function showing(app: ShownApp, text: string): Promise<void> {
  await expect.poll(() => frameOf(app.terminal), PATIENT).toContain(text);
}

/** The app over a list of repositories that the test changes as it goes. */
async function overRepositories(): Promise<{
  readonly app: ShownApp;
  readonly list: { items: readonly Repository[] };
}> {
  const list = { items: REPOSITORY_LIST.items };
  const app = await openedApp({
    scripted: {
      listRepositories: () => Promise.resolve(answered({ ...list })),
    },
  });
  await showing(app, 'row 1 of 4');
  return { app, list };
}

afterEach(cleanup);

describe('ShownScreen', () => {
  describe('when a person goes back', () => {
    it('should show the row they chose before they left', async () => {
      const app = await openedApp();

      await press(app.terminal, KEYS.down, KEYS.down);
      await showing(app, 'row 3 of 4');
      await press(app.terminal, KEYS.enter);
      await showing(app, FILES_PATH);
      await press(app.terminal, KEYS.escape);

      await showing(app, 'row 3 of 4');
      expect(frameOf(app.terminal)).toMatch(/› . example\/billing-api/u);
    });

    it('should show the files with the list, the filter and the row they left', async () => {
      const app = await openedApp();
      await press(app.terminal, KEYS.enter);
      await showing(app, FILES_PATH);

      await press(app.terminal, ']', '/', 's', 'u', 'm', KEYS.enter);
      await showing(app, '1 file in the snapshot · holding "sum"');
      await press(app.terminal, KEYS.enter);
      await showing(app, IMPROVEMENT);
      await press(app.terminal, KEYS.escape);

      await showing(app, '1 file in the snapshot · holding "sum"');
      expect(frameOf(app.terminal)).toContain('row 1 of 1');
    });

    it('should show the panel that had the focus', async () => {
      const app = await openedApp();
      await press(app.terminal, '2', KEYS.tab);
      await showing(app, 'tab list');

      await press(app.terminal, KEYS.enter);
      await showing(app, IMPROVEMENT);
      await press(app.terminal, KEYS.escape);

      await showing(app, 'NEEDS YOU');
      expect(frameOf(app.terminal)).toContain('tab list');
    });
  });

  describe('when a person leaves a section and comes back', () => {
    it('should show the section where they left it', async () => {
      const app = await openedApp();
      await press(app.terminal, KEYS.down, KEYS.enter);
      await showing(app, FILES_PATH);

      await press(app.terminal, '2');
      await showing(app, 'NEEDS YOU');
      await press(app.terminal, '1');
      await showing(app, FILES_PATH);
      await press(app.terminal, KEYS.escape);

      await showing(app, 'row 2 of 4');
    });

    it('should go to the first screen of the section that shows on its key', async () => {
      const app = await openedApp();
      await press(app.terminal, KEYS.down, KEYS.enter);
      await showing(app, FILES_PATH);

      await press(app.terminal, '1');

      await showing(app, 'row 2 of 4');
    });
  });

  describe('while a screen is hidden', () => {
    it('should ask the service nothing, and ask again once it shows', async () => {
      const app = await openedApp();
      await press(app.terminal, KEYS.enter);
      await showing(app, FILES_PATH);
      const listed = askedOf(app, 'listRepositories');
      const read = askedOf(app, 'getRepository');

      // The files are asked for twice more: a whole round has gone by.
      await expect
        .poll(() => askedOf(app, 'getRepository'), PATIENT)
        .toBeGreaterThan(read + 1);
      expect(askedOf(app, 'listRepositories')).toBe(listed);

      await press(app.terminal, KEYS.escape);
      await expect
        .poll(() => askedOf(app, 'listRepositories'), PATIENT)
        .toBeGreaterThan(listed);
    });

    it('should take no key', async () => {
      const app = await openedApp();
      await press(app.terminal, KEYS.enter);
      await showing(app, FILES_PATH);

      await press(app.terminal, 's', 'a', KEYS.escape);
      await showing(app, 'row 1 of 4');

      expect(askedOf(app, 'startScan')).toBe(0);
      expect(frameOf(app.terminal)).not.toContain('Connect a repository');
    });
  });

  describe('when what was chosen changed while it was hidden', () => {
    it('should follow the chosen repository to its new row', async () => {
      const { app, list } = await overRepositories();
      await press(app.terminal, KEYS.down, KEYS.enter);
      await showing(app, FILES_PATH);

      const [first, second, ...rest] = REPOSITORY_LIST.items;
      list.items = [first, ...rest, second].flatMap((each) =>
        each === undefined ? [] : [each],
      );
      await press(app.terminal, KEYS.escape);

      await showing(app, 'row 4 of 4');
      expect(frameOf(app.terminal)).toMatch(/› . example\/gateway/u);
    });

    it('should fall back to the nearest row when it is gone', async () => {
      const { app, list } = await overRepositories();
      await press(app.terminal, 'G', KEYS.enter);
      await showing(app, FILES_PATH);

      list.items = REPOSITORY_LIST.items.slice(0, -1);
      await press(app.terminal, KEYS.escape);

      await showing(app, 'row 3 of 3');
    });
  });
});
