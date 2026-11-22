import { describe, expect, it } from 'vitest';

import { Attempt } from '#improvement/domain/entities/attempt.entity';
import type { ImprovementState } from '#improvement/domain/entities/improvement-state';
import { InvalidImprovementValueError } from '#improvement/domain/errors/invalid-improvement-value.error';
import { checkedState } from '#improvement/domain/services/stored-state.service';
import {
  IMPROVEMENT_STATUSES,
  type ImprovementStatus,
} from '#improvement/domain/value-objects/improvement-status.vo';
import { FilePath } from '#kernel/primitives/file-path';
import {
  failureOf,
  improvementIn,
  pullRequestOf,
  skipOf,
} from '#tests/support/improvement-journeys';
import {
  baselineOf,
  CREATED_AT,
  IMPROVEMENT_ID,
  minutesIn,
} from '#tests/support/improvement-values';

function stateIn(
  status: ImprovementStatus,
  change: Partial<ImprovementState>,
): ImprovementState {
  return { ...improvementIn(status).state, ...change };
}

const open = (number: number): Attempt => Attempt.open(number, CREATED_AT);

const closed = (number: number): Attempt =>
  open(number).closedBy('no_changes', minutesIn(number));

describe('checkedState', () => {
  it.each(IMPROVEMENT_STATUSES)(
    'should give back a %s state its transitions wrote',
    (status) => {
      const { state } = improvementIn(status);

      expect(checkedState(state)).toBe(state);
    },
  );

  describe('when the state breaks a rule', () => {
    it.each<[string, ImprovementState]>([
      [
        'it keeps a moment to go on at exactly while it waits for a limit',
        stateIn('generating', { resumesAt: minutesIn(60) }),
      ],
      [
        'it keeps a moment to go on at exactly while it waits for a limit',
        stateIn('waiting_for_limit', { resumesAt: null }),
      ],
      [
        'only a failed improvement has a failure',
        stateIn('cancelled', { failure: failureOf() }),
      ],
      [
        'only a skipped improvement has a skip',
        stateIn('failed', { skip: skipOf() }),
      ],
      [
        'only a complete improvement has a pull request',
        stateIn('publishing', { pullRequest: pullRequestOf() }),
      ],
      [
        'its baseline of the gate measured its base commit and its file',
        stateIn('analyzing', {
          verificationBaseline: baselineOf({
            targetFile: FilePath.create('src/tax.ts'),
          }),
        }),
      ],
      [
        'it has a deadline once its work started',
        stateIn('analyzing', { deadlineAt: null }),
      ],
      [
        'it has a deadline once its work started',
        stateIn('awaiting_approval', { deadlineAt: null }),
      ],
      [
        'it generates only once both baselines are recorded',
        stateIn('generating', { baselineSnapshotId: null }),
      ],
      [
        'it generates only once both baselines are recorded',
        stateIn('completed', { verificationBaseline: null }),
      ],
      [
        'it publishes only a patch the gate accepted',
        stateIn('publishing', { attempts: [closed(1)] }),
      ],
      [
        'it waits for a window at most twice',
        stateIn('generating', { limitWaits: 3 }),
      ],
      [
        'it waits for a window at most twice',
        stateIn('generating', { limitWaits: -1 }),
      ],
      [
        'its attempts are numbered from 1 with no gap',
        stateIn('generating', { attempts: [closed(1), closed(3)] }),
      ],
      [
        'only its last attempt may be open',
        stateIn('generating', { attempts: [open(1), closed(2)] }),
      ],
      [
        'an attempt is open only while it generates or verifies',
        stateIn('analyzing', { attempts: [open(1)] }),
      ],
      [
        'one that verifies has an open attempt with a patch',
        stateIn('verifying', { attempts: [open(1)] }),
      ],
      [
        'one that verifies has an open attempt with a patch',
        stateIn('verifying', { attempts: [closed(1)] }),
      ],
      [
        'its version is a whole number from 1',
        stateIn('created', { version: 0 }),
      ],
      [
        'its version is a whole number from 1',
        stateIn('created', { version: 1.5 }),
      ],
    ])('should throw InvalidImprovementValueError: %s', (rule, state) => {
      expect(() => checkedState(state)).toThrow(
        new InvalidImprovementValueError(
          `The improvement ${IMPROVEMENT_ID} breaks a rule: ${rule}.`,
        ),
      );
    });
  });
});
