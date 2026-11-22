import { cleanup } from 'ink-testing-library';
import { afterEach, describe, expect, it } from 'vitest';

import type { ServiceApi } from '#api/service-api';
import { ServiceUnreachableError } from '#api/service-unreachable-error';
import { FilesScreen } from '#screens/files/files-screen';
import {
  answered,
  fakeSession,
  refused,
} from '#tests/support/fake-service-api';
import { KEYS, PATIENT, press } from '#tests/support/keys';
import { PAYMENTS_FILES } from '#tests/support/sample-files';
import {
  NEVER_SCANNED_REPOSITORY,
  SCANNED_REPOSITORY,
} from '#tests/support/sample-repositories';
import {
  NARROW,
  sampleFrame,
  SIZES,
  WIDE,
} from '#tests/support/sample-work-frame';
import { screenLog } from '#tests/support/sample-work-log';
import { drawnWith, widestLine } from '#tests/support/terminal-text';
import { frameOf, renderAt } from '#tests/support/wide-terminal';
import type { ThemeSettings } from '#theme/settings';
import type { TerminalSize } from '#theme/widths';

/** The repository and its files, answered on every ask. */
const SCANNED: Partial<ServiceApi> = {
  getRepository: () => Promise.resolve(answered(SCANNED_REPOSITORY)),
  listSnapshotFiles: () => Promise.resolve(answered(PAYMENTS_FILES)),
};

/** Answers once, and then the service is gone or broken. */
function answeredOnceThen(failure: Error): Partial<ServiceApi> {
  let asked = 0;
  return {
    ...SCANNED,
    getRepository: () => {
      asked += 1;
      return asked === 1
        ? Promise.resolve(answered(SCANNED_REPOSITORY))
        : Promise.reject(failure);
    },
  };
}

function shown(
  scripted: Partial<ServiceApi>,
  {
    size = WIDE,
    theme = {},
  }: {
    readonly size?: TerminalSize;
    readonly theme?: Partial<ThemeSettings>;
  } = {},
): { readonly terminal: ReturnType<typeof renderAt>; readonly log: string[] } {
  const noted = screenLog();
  const screen = (
    <FilesScreen
      session={fakeSession(scripted)}
      frame={sampleFrame(size)}
      repositoryId={SCANNED_REPOSITORY.id}
      onOpenImprovement={noted.onOpenImprovement}
      onBack={noted.onBack}
    />
  );
  const tree = <>{drawnWith({ animation: false, ...theme }, screen)}</>;
  return { terminal: renderAt(tree, size), log: noted.log };
}

async function loaded(scripted: Partial<ServiceApi>, size = WIDE) {
  const screen = shown(scripted, { size });
  await expect
    .poll(() => frameOf(screen.terminal), PATIENT)
    .toContain('src/billing/invoice.ts');
  return screen;
}

afterEach(cleanup);

describe('FilesScreen', () => {
  it('should say that it asks the service before the first answer', () => {
    const { terminal } = shown({
      getRepository: () => new Promise(() => undefined),
    });

    expect(frameOf(terminal)).toMatchSnapshot();
  });

  it('should show the files below the threshold, the first one chosen', async () => {
    const { terminal } = await loaded(SCANNED);

    expect(frameOf(terminal)).toMatchSnapshot();
  });

  describe('when the service stops answering', () => {
    it('should keep the last answer and say that it is not fresh', async () => {
      const failure = new ServiceUnreachableError('/tmp/service.sock');
      const { terminal } = await loaded(answeredOnceThen(failure));

      await expect
        .poll(() => frameOf(terminal), PATIENT)
        .toContain('! not fresh, updated');
      expect(frameOf(terminal)).toMatchSnapshot();
    });
  });

  describe('when a request fails for another reason', () => {
    it('should show the fault in place of the last answer', async () => {
      const { terminal } = await loaded(
        answeredOnceThen(new TypeError('Expected a number at items.0.')),
      );

      await expect
        .poll(() => frameOf(terminal), PATIENT)
        .toContain('✕ The request to the service failed.');
      expect(frameOf(terminal)).toContain('Expected a number at items.0.');
      expect(frameOf(terminal)).not.toContain('src/billing/invoice.ts');
    });
  });

  describe('when the service refuses', () => {
    it('should give its sentence and its code', async () => {
      const { terminal } = shown({
        getRepository: () =>
          Promise.resolve(
            refused(404, {
              error: 'not_found',
              message: 'No repository has this id.',
            }),
          ),
      });

      await expect
        .poll(() => frameOf(terminal), PATIENT)
        .toContain('! No repository has this id.  not_found');
    });

    it('should give the refusal of the files as well', async () => {
      const { terminal } = shown({
        ...SCANNED,
        listSnapshotFiles: () =>
          Promise.resolve(
            refused(404, { error: 'not_found', message: 'No snapshot.' }),
          ),
      });

      await expect
        .poll(() => frameOf(terminal), PATIENT)
        .toContain('! No snapshot.  not_found');
    });
  });

  describe('when the repository was never scanned', () => {
    it('should say so and the key that goes back', async () => {
      const { terminal, log } = shown({
        getRepository: () =>
          Promise.resolve(answered(NEVER_SCANNED_REPOSITORY)),
      });

      await expect
        .poll(() => frameOf(terminal), PATIENT)
        .toContain(
          'example/notifier has no scan yet. Press esc to go back and scan it.',
        );
      await press(terminal, KEYS.escape);
      expect(log).toEqual(['back']);
    });
  });

  it('should go back on esc', async () => {
    const { terminal, log } = await loaded(SCANNED);

    await press(terminal, KEYS.escape);

    expect(log).toEqual(['back']);
  });

  it('should show every status as a symbol and a word without colour', async () => {
    const { terminal } = shown(SCANNED, { theme: { colour: false } });

    await expect
      .poll(() => frameOf(terminal), PATIENT)
      .toContain('76.3%   75.0%  ? REVIEW');
  });

  it.each(SIZES)('should fit in $columns columns', async (size) => {
    const { terminal } = await loaded(SCANNED, size);

    expect(widestLine(frameOf(terminal))).toBeLessThanOrEqual(size.columns);
    expect(frameOf(terminal).split('\n').length).toBeLessThanOrEqual(size.rows);
  });

  describe('when the terminal has room for one panel', () => {
    it('should open the chosen file in place of the list on →', async () => {
      const { terminal } = await loaded(SCANNED, NARROW);
      expect(frameOf(terminal)).toContain('→ details');

      await press(terminal, KEYS.right);

      expect(frameOf(terminal)).toContain('41.2% of lines');
      expect(frameOf(terminal)).not.toContain('Below 2');
      expect(frameOf(terminal)).toContain('tab list');
    });
  });
});
