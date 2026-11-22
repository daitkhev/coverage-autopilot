import { cleanup } from 'ink-testing-library';
import { afterEach, describe, expect, it } from 'vitest';

import type { Repository } from '@coverage-autopilot/api-contracts/repositories';

import type { ServiceApi } from '#api/service-api';
import {
  ThresholdDialog,
  thresholdWords,
} from '#screens/repositories/threshold-dialog';
import {
  answered,
  fakeSession,
  refused,
} from '#tests/support/fake-service-api';
import { KEYS, PATIENT, press } from '#tests/support/keys';
import { NARROW } from '#tests/support/sample-frame';
import {
  OWN_THRESHOLD_REPOSITORY,
  SCANNED_REPOSITORY,
} from '#tests/support/sample-repositories';
import { drawnWith, widestLine } from '#tests/support/terminal-text';
import { frameOf, renderAt } from '#tests/support/wide-terminal';

const OUT_OF_RANGE = {
  error: 'invalid_request',
  message: 'It does not match its schema. percentage: Too big.',
} as const;

function opened(
  scripted: Partial<ServiceApi> = {},
  repository: Repository = SCANNED_REPOSITORY,
) {
  const log: string[] = [];
  const session = fakeSession(scripted);
  const dialog = (
    <ThresholdDialog
      repository={repository}
      change={async (percentage) =>
        session.api.changeThreshold(repository.id, { percentage })
      }
      onChanged={(changed) => {
        log.push(`changed to ${String(changed.threshold.percentage)}`);
      }}
      onClose={() => {
        log.push('closed');
      }}
    />
  );
  const tree = <>{drawnWith({ animation: false }, dialog)}</>;
  return { terminal: renderAt(tree, NARROW), log, calls: session.api.calls };
}

afterEach(cleanup);

describe('thresholdWords', () => {
  it.each([
    [SCANNED_REPOSITORY, '80.0% of lines, the default of the service'],
    [OWN_THRESHOLD_REPOSITORY, '90.0% of lines, its own'],
  ])('should say what the files are judged by', (repository, words) => {
    expect(thresholdWords(repository.threshold)).toBe(words);
  });
});

describe('ThresholdDialog', () => {
  it('should say what the files are judged by now, with an empty field for the default', () => {
    const { terminal } = opened();

    const frame = frameOf(terminal);
    expect(frame).toContain('Threshold of example/payments');
    expect(frame).toContain('judged by 80.0% of lines, the default');
    expect(frame).toMatch(/Percent\s+█/u);
    expect(widestLine(frame)).toBeLessThanOrEqual(NARROW.columns);
  });

  it('should start the field at the percent the repository has of its own', () => {
    const { terminal } = opened({}, OWN_THRESHOLD_REPOSITORY);

    expect(frameOf(terminal)).toMatch(/Percent\s+90/u);
  });

  it('should take digits alone, three at most', async () => {
    const { terminal } = opened();

    await press(terminal, '9', 'x', '%', '5', '1', '2');

    expect(frameOf(terminal)).toMatch(/Percent\s+951█/u);
  });

  describe('when a percent is saved', () => {
    it('should send it once and tell what the service took', async () => {
      const { terminal, log, calls } = opened({
        changeThreshold: () =>
          Promise.resolve(answered(OWN_THRESHOLD_REPOSITORY)),
      });

      await press(terminal, '9', '0', KEYS.enter);

      await expect.poll(() => log, PATIENT).toEqual(['changed to 90']);
      expect(calls).toEqual([
        {
          method: 'changeThreshold',
          arguments: ['repository-payments', { percentage: 90 }],
        },
      ]);
    });

    it('should send nothing more while the first is on its way', async () => {
      const { terminal, calls } = opened({
        changeThreshold: () => new Promise(() => undefined),
      });

      await press(terminal, '9', '0', KEYS.enter, KEYS.enter);

      await expect
        .poll(() => frameOf(terminal), PATIENT)
        .toContain('Saving the threshold');
      expect(calls).toHaveLength(1);
    });
  });

  describe('when the field is emptied', () => {
    it('should give the repository the default back', async () => {
      const { terminal, calls } = opened(
        {
          changeThreshold: () => Promise.resolve(answered(SCANNED_REPOSITORY)),
        },
        OWN_THRESHOLD_REPOSITORY,
      );

      await press(terminal, KEYS.backspace, KEYS.backspace, KEYS.enter);

      await expect
        .poll(() => calls.at(-1)?.arguments, PATIENT)
        .toEqual(['repository-payments', { percentage: null }]);
    });
  });

  describe('when the service refuses the percent', () => {
    it('should give its sentence and its code, and stay open', async () => {
      const { terminal, log } = opened({
        changeThreshold: () => Promise.resolve(refused(400, OUT_OF_RANGE)),
      });

      await press(terminal, '1', '0', '1', KEYS.enter);

      await expect
        .poll(() => frameOf(terminal), PATIENT)
        .toContain('invalid_request');
      expect(log).toEqual([]);
    });
  });

  describe('when nothing answers', () => {
    it('should say so', async () => {
      const { terminal } = opened({
        changeThreshold: () => Promise.reject(new Error('socket closed')),
      });

      await press(terminal, '9', '0', KEYS.enter);

      await expect
        .poll(() => frameOf(terminal), PATIENT)
        .toContain('Nothing answered the threshold: socket closed');
    });
  });

  it('should close with no change on esc', async () => {
    const { terminal, log, calls } = opened();

    await press(terminal, KEYS.escape);

    expect(log).toEqual(['closed']);
    expect(calls).toEqual([]);
  });
});
