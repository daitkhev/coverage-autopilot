import { cleanup } from 'ink-testing-library';
import { afterEach, describe, expect, it } from 'vitest';

import type {
  Improvement,
  ImprovementPatch,
} from '@coverage-autopilot/api-contracts/improvements';

import type { ServiceApi } from '#api/service-api';
import { PatchView } from '#screens/patch/patch-view';
import {
  answered,
  fakeSession,
  refused,
} from '#tests/support/fake-service-api';
import { KEYS, PATIENT, press } from '#tests/support/keys';
import { ACCEPTED_HASH } from '#tests/support/sample-attempts';
import {
  FRESH_ANSWER,
  NARROW,
  sampleFrame,
  SECTION,
  SIZES,
  WIDE,
} from '#tests/support/sample-frame';
import {
  IMPROVEMENT_BY_STATUS,
  PATCH_AWAITING_APPROVAL,
} from '#tests/support/sample-improvements';
import { SCANNED_REPOSITORY } from '#tests/support/sample-repositories';
import { LONG_PATCH, TWO_FILE_PATCH } from '#tests/support/sample-work-patch';
import { drawnWith, widestLine } from '#tests/support/terminal-text';
import { frameOf, renderAt } from '#tests/support/wide-terminal';
import type { ThemeSettings } from '#theme/settings';
import type { TerminalSize } from '#theme/widths';

const WAITING = IMPROVEMENT_BY_STATUS.awaiting_approval;
const PUBLISHED = IMPROVEMENT_BY_STATUS.completed;

interface Reviewing {
  readonly improvement?: Improvement;
  readonly patch?: ImprovementPatch;
  readonly scripted?: Partial<ServiceApi>;
  readonly size?: TerminalSize;
  readonly theme?: Partial<ThemeSettings>;
}

function reviewing(options: Reviewing = {}) {
  const { size = WIDE } = options;
  const log: string[] = [];
  const session = fakeSession(options.scripted ?? {});
  const shown = {
    improvement: options.improvement ?? WAITING,
    patch: options.patch ?? PATCH_AWAITING_APPROVAL,
    repository: SCANNED_REPOSITORY,
  };
  const view = (
    <PatchView
      session={session}
      frame={sampleFrame(size, SECTION.improvements)}
      shown={shown}
      freshness={FRESH_ANSWER}
      onReload={() => {
        log.push('reload');
      }}
      onBack={() => {
        log.push('back');
      }}
    />
  );
  const theme = { animation: false, ...options.theme };
  const terminal = renderAt(<>{drawnWith(theme, view)}</>, size);
  return { terminal, log, calls: session.api.calls };
}

function sent(calls: ReturnType<typeof reviewing>['calls']) {
  return calls.map((call) => call.method);
}

afterEach(cleanup);

describe('PatchView', () => {
  it('should show the patch, its evidence and the question', () => {
    const { terminal } = reviewing();

    expect(frameOf(terminal)).toMatchSnapshot();
    expect(frameOf(terminal)).toContain('› 1. Decide later');
  });

  describe('when the improvement waits for no approval', () => {
    it('should ask nothing', () => {
      const { terminal } = reviewing({ improvement: PUBLISHED });

      expect(frameOf(terminal)).not.toContain('Your decision');
      expect(frameOf(terminal)).toContain('patch of attempt 1');
    });
  });

  describe('when the patch is approved', () => {
    it('should send the hash on the screen and say what happens', async () => {
      const { terminal, calls } = reviewing({
        scripted: {
          approveImprovement: () =>
            Promise.resolve(answered(IMPROVEMENT_BY_STATUS.publishing, 202)),
        },
      });

      await press(terminal, KEYS.down, KEYS.enter);

      await expect
        .poll(() => frameOf(terminal), PATIENT)
        .toContain('Approved. The service opens the pull request.');
      expect(calls).toEqual([
        {
          method: 'approveImprovement',
          arguments: [WAITING.id, { patchHash: ACCEPTED_HASH }],
        },
      ]);
      expect(frameOf(terminal)).not.toContain('Your decision');
    });

    it('should send it once, however often enter is pressed', async () => {
      const { terminal, calls } = reviewing({
        scripted: { approveImprovement: () => new Promise(() => undefined) },
      });

      await press(terminal, '2', KEYS.enter, KEYS.enter);

      await expect
        .poll(() => frameOf(terminal), PATIENT)
        .toContain('Sending your decision');
      expect(sent(calls)).toEqual(['approveImprovement']);
    });
  });

  describe('when the service names another hash', () => {
    it('should load the patch again and say so', async () => {
      const { terminal, log } = reviewing({
        scripted: {
          approveImprovement: () =>
            Promise.resolve(
              refused(409, {
                error: 'patch_hash_mismatch',
                message: 'Another patch waits for approval.',
              }),
            ),
        },
      });

      await press(terminal, KEYS.down, KEYS.enter);

      await expect
        .poll(() => frameOf(terminal), PATIENT)
        .toContain('The patch changed since it was shown');
      expect(log).toEqual(['reload']);
      expect(frameOf(terminal)).toContain('Your decision');
    });
  });

  describe('when the service refuses for another reason', () => {
    it('should give its sentence and keep the question', async () => {
      const { terminal } = reviewing({
        scripted: {
          approveImprovement: () =>
            Promise.resolve(
              refused(409, {
                error: 'status_conflict',
                message: 'The improvement waits for no approval.',
              }),
            ),
        },
      });

      await press(terminal, KEYS.down, KEYS.enter);

      await expect
        .poll(() => frameOf(terminal), PATIENT)
        .toContain('! The improvement waits for no approval. status_conflict');
    });
  });

  describe('when nothing answers the decision', () => {
    it('should say so', async () => {
      const failure = new Error('socket closed');
      const { terminal } = reviewing({
        scripted: { approveImprovement: () => Promise.reject(failure) },
      });

      await press(terminal, KEYS.down, KEYS.enter);

      await expect
        .poll(() => frameOf(terminal), PATIENT)
        .toContain('Nothing answered the decision: socket closed');
    });
  });

  describe('when the patch is rejected', () => {
    it('should cancel the improvement and say so', async () => {
      const { terminal, calls } = reviewing({
        scripted: {
          cancelImprovement: () =>
            Promise.resolve(answered(IMPROVEMENT_BY_STATUS.cancelled, 202)),
        },
      });

      await press(terminal, '3', KEYS.enter);

      await expect
        .poll(() => frameOf(terminal), PATIENT)
        .toContain('Rejected. The improvement is cancelled.');
      expect(sent(calls)).toEqual(['cancelImprovement']);
    });
  });

  describe('when the decision is left for later', () => {
    it('should go back and send nothing', async () => {
      const { terminal, log, calls } = reviewing();

      await press(terminal, KEYS.down, KEYS.up, KEYS.enter);

      expect(log).toEqual(['back']);
      expect(calls).toEqual([]);
    });
  });

  describe('when the patch is longer than the panel', () => {
    it('should scroll it while the question stays', async () => {
      const { terminal } = reviewing({ patch: LONG_PATCH });
      expect(frameOf(terminal)).toContain('line 1 of 40');

      await press(terminal, 'j', 'j', 'k');
      expect(frameOf(terminal)).toContain('line 2 of 40');

      await press(terminal, KEYS.pageDown, 'G');
      expect(frameOf(terminal)).toContain("it('should keep case 40'");
      expect(frameOf(terminal)).toContain('Your decision');

      await press(terminal, KEYS.pageUp, 'g');
      expect(frameOf(terminal)).toContain('line 1 of 40');
    });

    it('should scroll it with the arrows when nothing is asked', async () => {
      const { terminal } = reviewing({
        improvement: PUBLISHED,
        patch: LONG_PATCH,
      });

      await press(terminal, KEYS.down, KEYS.down, KEYS.up);

      expect(frameOf(terminal)).toContain('line 2 of 40');
    });
  });

  describe('when the patch adds no file', () => {
    it('should say so and give no position', () => {
      const empty = { ...PATCH_AWAITING_APPROVAL, patch: 'no diff' };
      const { terminal } = reviewing({ patch: empty });

      expect(frameOf(terminal)).toContain('The patch adds no file.');
      expect(frameOf(terminal)).not.toContain('line 1 of');
    });
  });

  describe('when the patch changes more than one file', () => {
    it('should show one file at a time', async () => {
      const { terminal } = reviewing({ patch: TWO_FILE_PATCH });
      expect(frameOf(terminal)).toContain('file 1 of 2');

      await press(terminal, ']');
      expect(frameOf(terminal)).toContain('file 2 of 2');
      expect(frameOf(terminal)).toContain('changed  src/billing/fixtures.ts');
      expect(frameOf(terminal)).toContain('+1 -1');

      await press(terminal, '[');
      expect(frameOf(terminal)).toContain('file 1 of 2');
    });
  });

  describe('when the terminal has room for one panel', () => {
    it('should open the evidence in place of the patch on →', async () => {
      const { terminal } = reviewing({ size: NARROW });
      expect(frameOf(terminal)).toContain('→ evidence');

      await press(terminal, KEYS.right);

      expect(frameOf(terminal)).toContain('ACCEPTED');
      expect(frameOf(terminal)).not.toContain('sumTaxes');
      expect(frameOf(terminal)).toContain('tab patch');
      expect(frameOf(terminal)).toContain('Your decision');

      await press(terminal, KEYS.left);
      expect(frameOf(terminal)).toContain('sumTaxes');
    });
  });

  it('should show every status as a symbol and a word without colour', () => {
    const { terminal } = reviewing({ theme: { colour: false } });

    const frame = frameOf(terminal);
    expect(frame).toContain('✓ ACCEPTED');
    expect(frame).toContain('✓ only test files changed');
    expect(frame).toContain('new file');
  });

  describe.each(SIZES)('when the terminal has $columns columns', (size) => {
    it.each([
      ['in review', WAITING],
      ['published', PUBLISHED],
    ])('should fit %s', (_name, improvement) => {
      const { terminal } = reviewing({ improvement, patch: LONG_PATCH, size });

      const frame = frameOf(terminal);
      expect(widestLine(frame)).toBeLessThanOrEqual(size.columns);
      expect(frame.split('\n').length).toBeLessThanOrEqual(size.rows);
    });
  });
});
