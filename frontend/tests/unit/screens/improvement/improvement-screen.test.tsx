import { cleanup } from 'ink-testing-library';
import { afterEach, describe, expect, it } from 'vitest';

import type { ServiceApi } from '#api/service-api';
import { ServiceUnreachableError } from '#api/service-unreachable-error';
import { ImprovementScreen } from '#screens/improvement/improvement-screen';
import {
  answered,
  fakeSession,
  refused,
} from '#tests/support/fake-service-api';
import { KEYS, PATIENT, press } from '#tests/support/keys';
import {
  NARROW,
  sampleFrame,
  SECTION,
  SIZES,
  WIDE,
} from '#tests/support/sample-frame';
import { IMPROVEMENT_BY_STATUS } from '#tests/support/sample-improvements';
import { SCANNED_REPOSITORY } from '#tests/support/sample-repositories';
import { screenLog } from '#tests/support/sample-work-log';
import { drawnWith, widestLine } from '#tests/support/terminal-text';
import { frameOf, renderAt } from '#tests/support/wide-terminal';
import type { TerminalSize } from '#theme/widths';

const { verifying } = IMPROVEMENT_BY_STATUS;

/** The improvement and its repository, answered on every ask. */
const RUNNING: Partial<ServiceApi> = {
  getImprovement: () => Promise.resolve(answered(verifying)),
  getRepository: () => Promise.resolve(answered(SCANNED_REPOSITORY)),
};

/** Answers once, and then the service is gone or broken. */
function answeredOnceThen(failure: Error): Partial<ServiceApi> {
  let asked = 0;
  return {
    ...RUNNING,
    getImprovement: () => {
      asked += 1;
      return asked === 1
        ? Promise.resolve(answered(verifying))
        : Promise.reject(failure);
    },
  };
}

function shown(scripted: Partial<ServiceApi>, size: TerminalSize = WIDE) {
  const noted = screenLog();
  const screen = (
    <ImprovementScreen
      session={fakeSession(scripted)}
      frame={sampleFrame(size, SECTION.improvements)}
      improvementId={verifying.id}
      onOpenPatch={noted.onOpenPatch}
      onBack={noted.onBack}
    />
  );
  const tree = <>{drawnWith({ animation: false }, screen)}</>;
  return { terminal: renderAt(tree, size), log: noted.log };
}

async function loaded(scripted: Partial<ServiceApi>, size = WIDE) {
  const screen = shown(scripted, size);
  await expect
    .poll(() => frameOf(screen.terminal), PATIENT)
    .toContain('Attempt 2');
  return screen;
}

afterEach(cleanup);

describe('ImprovementScreen', () => {
  it('should say that it asks the service before the first answer', () => {
    const { terminal } = shown({
      getImprovement: () => new Promise(() => undefined),
    });

    expect(frameOf(terminal)).toMatchSnapshot();
  });

  it('should show the work of the improvement it was given', async () => {
    const { terminal } = await loaded(RUNNING);

    expect(frameOf(terminal)).toContain(
      'Improvements › example/payments › src/billing/invoice.ts',
    );
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
        answeredOnceThen(new TypeError('Expected a string at status.')),
      );

      await expect
        .poll(() => frameOf(terminal), PATIENT)
        .toContain('✕ The improvement could not be read');
      expect(frameOf(terminal)).not.toContain('Attempt 2');
    });
  });

  describe('when the service refuses', () => {
    it('should give its sentence and offer the way back', async () => {
      const { terminal, log } = shown({
        getImprovement: () =>
          Promise.resolve(
            refused(404, {
              error: 'not_found',
              message: 'No improvement has this id.',
            }),
          ),
      });

      await expect
        .poll(() => frameOf(terminal), PATIENT)
        .toContain('! The improvement could not be read  not_found');

      expect(frameOf(terminal)).toContain('No improvement has this id.');
      await press(terminal, KEYS.escape);
      expect(log).toEqual(['back']);
    });

    it('should give the refusal of the repository as well', async () => {
      const { terminal } = shown({
        ...RUNNING,
        getRepository: () =>
          Promise.resolve(
            refused(404, { error: 'not_found', message: 'No repository.' }),
          ),
      });

      await expect
        .poll(() => frameOf(terminal), PATIENT)
        .toContain('! The improvement could not be read  not_found');

      expect(frameOf(terminal)).toContain('No repository.');
    });
  });

  it('should go back on esc', async () => {
    const { terminal, log } = await loaded(RUNNING);

    await press(terminal, KEYS.escape);

    expect(log).toEqual(['back']);
  });

  it.each(SIZES)('should fit in $columns columns', async (size) => {
    const { terminal } = await loaded(RUNNING, size);

    expect(widestLine(frameOf(terminal))).toBeLessThanOrEqual(size.columns);
    expect(frameOf(terminal).split('\n').length).toBeLessThanOrEqual(size.rows);
  });

  describe('when the terminal has room for one panel', () => {
    it('should open the facts in place of the work on →', async () => {
      const { terminal } = await loaded(RUNNING, NARROW);

      await press(terminal, KEYS.right);

      expect(frameOf(terminal)).toContain('Attempts');
      expect(frameOf(terminal)).not.toContain('Analyzing');
    });
  });
});
