import { cleanup } from 'ink-testing-library';
import { afterEach, describe, expect, it } from 'vitest';

import type { ServiceApi } from '#api/service-api';
import { ServiceUnreachableError } from '#api/service-unreachable-error';
import { PatchScreen } from '#screens/patch/patch-screen';
import {
  answered,
  fakeSession,
  refused,
} from '#tests/support/fake-service-api';
import { KEYS, PATIENT, press } from '#tests/support/keys';
import {
  IMPROVEMENT_BY_STATUS,
  PATCH_AWAITING_APPROVAL,
} from '#tests/support/sample-improvements';
import { SCANNED_REPOSITORY } from '#tests/support/sample-repositories';
import { sampleFrame, WIDE } from '#tests/support/sample-work-frame';
import { NEWER_PATCH } from '#tests/support/sample-work-patch';
import { drawnWith } from '#tests/support/terminal-text';
import { frameOf, renderAt } from '#tests/support/wide-terminal';

const WAITING = IMPROVEMENT_BY_STATUS.awaiting_approval;

/** The improvement, its patch and its repository, answered on every ask. */
const IN_REVIEW: Partial<ServiceApi> = {
  getImprovement: () => Promise.resolve(answered(WAITING)),
  getImprovementPatch: () => Promise.resolve(answered(PATCH_AWAITING_APPROVAL)),
  getRepository: () => Promise.resolve(answered(SCANNED_REPOSITORY)),
};

function shown(scripted: Partial<ServiceApi>) {
  const log: string[] = [];
  const session = fakeSession(scripted);
  const screen = (
    <PatchScreen
      session={session}
      frame={sampleFrame(WIDE)}
      improvementId={WAITING.id}
      onBack={() => {
        log.push('back');
      }}
    />
  );
  const tree = <>{drawnWith({ animation: false }, screen)}</>;
  return { terminal: renderAt(tree, WIDE), log, calls: session.api.calls };
}

async function loaded(scripted: Partial<ServiceApi>) {
  const screen = shown(scripted);
  await expect
    .poll(() => frameOf(screen.terminal), PATIENT)
    .toContain('Your decision');
  return screen;
}

afterEach(cleanup);

describe('PatchScreen', () => {
  it('should say that it asks the service before the first answer', () => {
    const { terminal } = shown({
      getImprovement: () => new Promise(() => undefined),
    });

    expect(frameOf(terminal)).toMatchSnapshot();
  });

  describe('when the service stops answering', () => {
    it('should keep the last patch and say that it is not fresh', async () => {
      let asked = 0;
      const { terminal } = await loaded({
        ...IN_REVIEW,
        getImprovement: () => {
          asked += 1;
          return asked === 1
            ? Promise.resolve(answered(WAITING))
            : Promise.reject(new ServiceUnreachableError('/tmp/s.sock'));
        },
      });

      await expect
        .poll(() => frameOf(terminal), PATIENT)
        .toContain('not fresh, asking again');
      expect(frameOf(terminal)).toMatchSnapshot();
    });
  });

  describe('when no attempt was accepted', () => {
    it('should give the refusal and offer the way back', async () => {
      const { terminal, log } = shown({
        ...IN_REVIEW,
        getImprovementPatch: () =>
          Promise.resolve(
            refused(409, {
              error: 'status_conflict',
              message: 'No attempt was accepted.',
            }),
          ),
      });

      await expect
        .poll(() => frameOf(terminal), PATIENT)
        .toContain('! No attempt was accepted.  status_conflict');
      await press(terminal, KEYS.escape);
      expect(log).toEqual(['back']);
    });
  });

  describe('when a request fails for another reason', () => {
    it('should show the fault', async () => {
      const { terminal } = shown({
        ...IN_REVIEW,
        getImprovementPatch: () =>
          Promise.reject(new TypeError('Expected a hash.')),
      });

      await expect
        .poll(() => frameOf(terminal), PATIENT)
        .toContain('✕ The request to the service failed.');
    });
  });

  describe('when the patch changed before the approval', () => {
    it('should show the new patch and say why', async () => {
      let changed = false;
      const { terminal } = await loaded({
        ...IN_REVIEW,
        getImprovementPatch: () =>
          Promise.resolve(
            answered(changed ? NEWER_PATCH : PATCH_AWAITING_APPROVAL),
          ),
        approveImprovement: () => {
          changed = true;
          return Promise.resolve(
            refused(409, {
              error: 'patch_hash_mismatch',
              message: 'Another patch waits for approval.',
            }),
          );
        },
      });
      expect(frameOf(terminal)).toContain('Patch 9c1e7ab');

      await press(terminal, KEYS.down, KEYS.enter);

      await expect
        .poll(() => frameOf(terminal), PATIENT)
        .toContain('Patch 4b7d21e');
      expect(frameOf(terminal)).toContain('loaded again');
    });
  });
});
