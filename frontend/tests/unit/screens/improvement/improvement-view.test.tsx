import { cleanup } from 'ink-testing-library';
import { afterEach, describe, expect, it } from 'vitest';

import type { Improvement } from '@coverage-autopilot/api-contracts/improvements';

import type { ServiceApi } from '#api/service-api';
import { ImprovementView } from '#screens/improvement/improvement-view';
import { fakeSession, SAMPLE_NOW } from '#tests/support/fake-service-api';
import { KEYS, press } from '#tests/support/keys';
import { ACCEPTED_ATTEMPT } from '#tests/support/sample-attempts';
import {
  FRESH_ANSWER,
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
import type { ThemeSettings } from '#theme/settings';
import type { TerminalSize } from '#theme/widths';

interface Viewing {
  readonly size?: TerminalSize;
  readonly theme?: Partial<ThemeSettings>;
  readonly moment?: string;
  readonly scripted?: Partial<ServiceApi>;
}

function viewing(improvement: Improvement, options: Viewing = {}) {
  const { size = WIDE, moment = SAMPLE_NOW } = options;
  const noted = screenLog();
  const session = fakeSession(options.scripted ?? {}, moment);
  const view = (
    <ImprovementView
      session={session}
      frame={sampleFrame(size, SECTION.improvements)}
      improvement={improvement}
      repository={SCANNED_REPOSITORY}
      freshness={FRESH_ANSWER}
      onOpenPatch={noted.onOpenPatch}
      onOpenImprovement={noted.onOpenImprovement}
      onBack={noted.onBack}
    />
  );
  const theme = { animation: false, ...options.theme };
  const terminal = renderAt(<>{drawnWith(theme, view)}</>, size);
  return { terminal, log: noted.log, calls: session.api.calls };
}

const { verifying, completed, failed, skipped, cancelled } =
  IMPROVEMENT_BY_STATUS;

/** A failure after the gate accepted a patch, so the patch can be read. */
const PUBLISH_FAILED: Improvement = {
  ...failed,
  attempts: [ACCEPTED_ATTEMPT],
  failure: {
    reason: 'publish_failed',
    message: 'The host refused the branch.',
  },
};

afterEach(cleanup);

describe('ImprovementView', () => {
  it('should show the history, the running checks and the facts', () => {
    const { terminal } = viewing(verifying);

    expect(frameOf(terminal)).toMatchSnapshot();
  });

  describe.each([
    ['completed', completed],
    ['failed', failed],
    ['skipped', skipped],
    ['cancelled', cancelled],
  ])('when the improvement %s', (_status, improvement) => {
    it('should show how it ended', () => {
      const { terminal } = viewing(improvement);

      expect(frameOf(terminal)).toMatchSnapshot();
      expect(frameOf(terminal)).not.toContain('c cancel');
    });
  });

  describe('when the improvement failed', () => {
    it('should offer the way back as the next step', async () => {
      const { terminal, log } = viewing(failed);

      expect(frameOf(terminal)).toContain('2. Go back');
      await press(terminal, KEYS.down, KEYS.enter);

      expect(log).toEqual(['back']);
    });

    it('should offer the patch that passed the gate first', async () => {
      const { terminal, log } = viewing(PUBLISH_FAILED);

      expect(frameOf(terminal)).toContain('1. Show the patch of attempt 1');
      await press(terminal, KEYS.down, KEYS.up, 'j', 'k', KEYS.enter);

      expect(log).toEqual([`patch ${failed.id}`]);
    });
  });

  describe('when p is pressed', () => {
    it('should open the patch the gate accepted', async () => {
      const { terminal, log } = viewing(
        IMPROVEMENT_BY_STATUS.awaiting_approval,
      );

      await press(terminal, 'p');

      expect(log).toEqual(['patch improvement-sum']);
    });

    it('should open nothing while no patch passed', async () => {
      const { terminal, log } = viewing(verifying);

      await press(terminal, 'p');

      expect(log).toEqual([]);
      expect(frameOf(terminal)).not.toContain('p patch');
    });
  });

  describe('when c is pressed', () => {
    it('should ask first, with the answer that keeps the work chosen', async () => {
      const { terminal, log, calls } = viewing(verifying);

      await press(terminal, 'c');

      expect(frameOf(terminal)).toMatchSnapshot();
      await press(terminal, 'p', KEYS.tab, KEYS.right, KEYS.enter);
      expect(frameOf(terminal)).not.toContain('Cancel this improvement?');
      expect(frameOf(terminal)).toContain('c cancel');
      expect(log).toEqual([]);
      expect(calls).toEqual([]);
    });

    it('should close the question on esc and keep the work', async () => {
      const { terminal, calls } = viewing(verifying);

      await press(terminal, 'c', KEYS.escape);

      expect(frameOf(terminal)).not.toContain('Cancel this improvement?');
      expect(calls).toEqual([]);
    });
  });

  describe('when the facts have the focus', () => {
    it('should keep the keys of the work and offer the way back', async () => {
      const { terminal, log } = viewing(failed);

      await press(terminal, KEYS.tab);
      expect(frameOf(terminal)).toContain('tab work');
      expect(frameOf(terminal)).not.toContain('enter confirm');

      await press(terminal, KEYS.enter, KEYS.left, KEYS.down, KEYS.enter);
      expect(log).toEqual(['back']);
    });
  });

  describe('when the terminal has room for one panel', () => {
    it('should open the facts in place of the work on →', async () => {
      const { terminal } = viewing(verifying, { size: NARROW });
      expect(frameOf(terminal)).toContain('→ details');

      await press(terminal, KEYS.right);

      expect(frameOf(terminal)).toContain('USED');
      expect(frameOf(terminal)).not.toContain('Analyzing');
      expect(frameOf(terminal)).toContain('tab work');
    });
  });

  describe('when the worker stopped writing its steps', () => {
    it('should not look busy', () => {
      const { terminal } = viewing(verifying, {
        moment: '2026-11-21T14:06:00.000Z',
      });

      const frame = frameOf(terminal);
      expect(frame).toContain('! Checking the patch: new tests pass');
      expect(frame).toContain('updated 1m ago');
      expect(frame).not.toContain('⠋ Checking');
    });
  });

  describe('when it waits for the limit of the generator', () => {
    it('should say until when, and not look late', () => {
      const { terminal } = viewing(IMPROVEMENT_BY_STATUS.waiting_for_limit, {
        moment: '2026-11-21T14:30:00.000Z',
      });

      const frame = frameOf(terminal);
      expect(frame).toContain('○ Waiting for the limit until 16:00');
      expect(frame).not.toContain('! Waiting');
    });
  });

  it('should show every status as a symbol and a word without colour', () => {
    const { terminal } = viewing(verifying, { theme: { colour: false } });

    const frame = frameOf(terminal);
    expect(frame).toContain('✕ Attempt 1  rejected');
    expect(frame).toContain('⠋ RUN');
    expect(frame).toContain('✓ only test files changed');
  });

  describe.each(SIZES)('when the terminal has $columns columns', (size) => {
    it.each(Object.values(IMPROVEMENT_BY_STATUS))(
      'should fit $status',
      (improvement) => {
        const { terminal } = viewing(improvement, { size });

        const frame = frameOf(terminal);
        expect(widestLine(frame)).toBeLessThanOrEqual(size.columns);
        expect(frame.split('\n').length).toBeLessThanOrEqual(size.rows);
      },
    );
  });
});
