import { cleanup } from 'ink-testing-library';
import { afterEach, describe, expect, it } from 'vitest';

import { answered } from '#tests/support/fake-service-api';
import { KEYS, PATIENT, press } from '#tests/support/keys';
import { askedOf, openedApp, type ShownApp } from '#tests/support/sample-app';
import { IMPROVEMENT_BY_STATUS } from '#tests/support/sample-improvements';
import {
  SCANNED_REPOSITORY,
  TRUSTED_REPOSITORY,
} from '#tests/support/sample-repositories';
import { widestLine } from '#tests/support/terminal-text';
import { frameOf } from '#tests/support/wide-terminal';
import { DIALOG_WIDTH, SMALLEST_SIZE } from '#theme/widths';

const FILES_PATH = 'Repositories › example/payments';

/** Waits until the terminal shows a text. */
async function showing(app: ShownApp, text: string): Promise<void> {
  await expect.poll(() => frameOf(app.terminal), PATIENT).toContain(text);
}

/** The open list of commands alone, cut out of the screen behind it. */
function paletteOf(app: ShownApp): string {
  const lines = frameOf(app.terminal).split('\n');
  const top = lines.findIndex((line) => line.includes('╭─ Commands'));
  const left = lines[top]?.indexOf('╭─ Commands') ?? 0;
  const width = DIALOG_WIDTH.palette;
  return lines
    .slice(top, top + SMALLEST_SIZE.rows)
    .map((line) => line.slice(left, left + width))
    .join('\n');
}

/** Opens the list of commands, and types into it. */
async function typed(app: ShownApp, ...letters: string[]): Promise<void> {
  await press(app.terminal, ':', ...letters);
  await showing(app, 'Commands');
}

/** Opens the list of commands, types a part of a title and runs it. */
async function ran(app: ShownApp, ...letters: string[]): Promise<void> {
  await typed(app, ...letters);
  await press(app.terminal, KEYS.enter);
}

afterEach(cleanup);

describe('AppPalette', () => {
  it('should list the actions of the screen first, then those of the app', async () => {
    const app = await openedApp();

    await typed(app);

    const lines = paletteOf(app);
    expect(lines).toMatch(/Scan this repository +example\/payments +s/u);
    expect(lines).toMatch(/Open its files +example\/payments +enter/u);
    expect(lines).toMatch(/Choose how it is installed +example\/payments +i/u);
    expect(lines).toMatch(/Connect a repository +a/u);
    expect(lines.indexOf('Connect a repository')).toBeLessThan(
      lines.indexOf('Go to Repositories'),
    );
    expect(lines).toMatch(/Go to Repositories +1/u);
  });

  it('should narrow the actions and the commands by what is typed', async () => {
    const app = await openedApp();

    await typed(app, 'o', 'p', 'e', 'n');

    const lines = paletteOf(app);
    expect(lines).toContain('Open its files');
    expect(lines).not.toContain('Scan this repository');
    expect(lines).not.toContain('Go to');
  });

  it('should run an action as its key does', async () => {
    const app = await openedApp();

    await ran(app, 's', 'c', 'a', 'n');

    await expect.poll(() => askedOf(app, 'startScan'), PATIENT).toBe(1);
    expect(app.session.api.calls.at(-1)?.arguments[0]).toBe(
      SCANNED_REPOSITORY.id,
    );
    expect(frameOf(app.terminal)).not.toContain('Commands');
  });

  it('should run an action the footer has no room for, and its dialog', async () => {
    const app = await openedApp({
      scripted: {
        changeInstallMode: () => Promise.resolve(answered(TRUSTED_REPOSITORY)),
      },
    });

    await ran(app, 'i', 'n', 's', 't', 'a', 'l', 'l');
    await showing(app, 'Install of example/payments');
    expect(frameOf(app.terminal)).toContain(
      'choose how example/payments is installed',
    );
    await press(app.terminal, '3', KEYS.enter);

    await showing(app, 'example/payments is installed trusted, its own.');
    expect(app.session.api.calls.at(-1)).toEqual({
      method: 'changeInstallMode',
      arguments: [SCANNED_REPOSITORY.id, { mode: 'trusted' }],
    });
  });

  it('should leave out an action that cannot run now', async () => {
    const app = await openedApp();
    await press(app.terminal, KEYS.down);
    await showing(app, 'row 2 of 4');

    await typed(app);

    expect(paletteOf(app)).toContain('Open its files');
    expect(paletteOf(app)).not.toContain('Scan this repository');
  });

  it('should offer only what the screen that shows can do', async () => {
    const app = await openedApp();
    await press(app.terminal, KEYS.enter);
    await showing(app, FILES_PATH);

    await typed(app);

    const lines = paletteOf(app);
    expect(lines).toMatch(/Improve this file +src\/billing\/invoice\.ts +i/u);
    expect(lines).toMatch(/Show the next list +All +\]/u);
    expect(lines).not.toContain('Scan this repository');
  });

  it('should go back as esc does', async () => {
    const app = await openedApp();
    await press(app.terminal, KEYS.down, KEYS.enter);
    await showing(app, FILES_PATH);

    await ran(app, 'b', 'a', 'c', 'k');

    await expect
      .poll(() => frameOf(app.terminal), PATIENT)
      .not.toContain(FILES_PATH);
    expect(frameOf(app.terminal)).toMatch(/row \d of 4/u);
  });

  it('should offer nothing of a screen whose dialog has the keys', async () => {
    const app = await openedApp();
    await press(app.terminal, '2', 'c');
    await showing(app, 'Cancel this improvement?');

    await press(app.terminal, ':');

    expect(frameOf(app.terminal)).not.toContain('Commands');
  });

  it('should fit in 80 columns and the lowest window, and scroll its list', async () => {
    const app = await openedApp({ size: SMALLEST_SIZE });
    await press(app.terminal, KEYS.enter);
    await showing(app, FILES_PATH);

    await typed(app);
    await showing(app, 'more below');
    await press(app.terminal, ...Array.from({ length: 12 }, () => KEYS.down));

    const frame = frameOf(app.terminal);
    expect(frame).toContain('› Show the keys');
    expect(frame).not.toContain('more below');
    expect(widestLine(frame)).toBeLessThanOrEqual(SMALLEST_SIZE.columns);
    expect(frame.split('\n').length).toBeLessThanOrEqual(SMALLEST_SIZE.rows);
  });

  describe('on the screen of one improvement', () => {
    it('should offer the next steps of failed work, each once', async () => {
      const app = await openedApp({
        scripted: {
          getImprovement: () =>
            Promise.resolve(answered(IMPROVEMENT_BY_STATUS.failed)),
        },
      });
      await press(app.terminal, '2', KEYS.enter);
      await showing(app, 'Go back');

      await typed(app);

      const lines = paletteOf(app);
      expect(lines).toContain('Request it again with larger limits');
      expect(lines).toMatch(/Go on to the next file +n/u);
      expect(lines.match(/Go back/gu)).toHaveLength(1);
      expect(lines).not.toContain('Cancel the improvement');
    });
  });

  describe('on the patch that waits for a decision', () => {
    it('should choose an answer as its digit does, for enter to confirm', async () => {
      const app = await openedApp({
        scripted: {
          approveImprovement: () =>
            Promise.resolve(answered(IMPROVEMENT_BY_STATUS.publishing)),
        },
      });
      await press(app.terminal, '2', KEYS.enter);
      await showing(app, 'p patch');
      await press(app.terminal, 'p');
      await showing(app, 'Your decision');

      await ran(app, 'a', 'p', 'p', 'r', 'o', 'v', 'e');
      await showing(app, '› 2. Approve and open the pull request');
      expect(askedOf(app, 'approveImprovement')).toBe(0);
      await press(app.terminal, KEYS.enter);

      await expect
        .poll(() => askedOf(app, 'approveImprovement'), PATIENT)
        .toBe(1);
    });
  });

  describe('on the service screen', () => {
    it('should offer to restart an idle service', async () => {
      const app = await openedApp();
      await press(app.terminal, '3');
      await showing(app, 'Storage and actions');

      await typed(app);

      expect(paletteOf(app)).toMatch(/Restart the service +r/u);
    });
  });
});
