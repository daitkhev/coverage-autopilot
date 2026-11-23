import { cleanup } from 'ink-testing-library';
import { afterEach, describe, expect, it } from 'vitest';

import type { Repository } from '@coverage-autopilot/api-contracts/repositories';

import type { ServiceApi } from '#api/service-api';
import { installWords, TrustDialog } from '#screens/repositories/trust-dialog';
import {
  answered,
  fakeSession,
  refused,
} from '#tests/support/fake-service-api';
import { KEYS, PATIENT, press } from '#tests/support/keys';
import { NARROW } from '#tests/support/sample-frame';
import {
  SCANNED_REPOSITORY,
  TRUSTED_REPOSITORY,
} from '#tests/support/sample-repositories';
import { drawnWith, widestLine } from '#tests/support/terminal-text';
import { frameOf, renderAt } from '#tests/support/wide-terminal';

const NOT_A_MODE = {
  error: 'invalid_request',
  message: 'It does not match its schema. mode: Invalid option.',
} as const;

function opened(
  scripted: Partial<ServiceApi> = {},
  repository: Repository = SCANNED_REPOSITORY,
) {
  const log: string[] = [];
  const session = fakeSession({
    changeInstallMode: () => Promise.resolve(answered(TRUSTED_REPOSITORY)),
    ...scripted,
  });
  const dialog = (
    <TrustDialog
      repository={repository}
      change={async (mode) =>
        session.api.changeInstallMode(repository.id, { mode })
      }
      onChanged={(changed) => {
        log.push(`changed to ${changed.install.mode}`);
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

describe('installWords', () => {
  it.each([
    [SCANNED_REPOSITORY, 'sandboxed, the default of the service'],
    [TRUSTED_REPOSITORY, 'trusted, its own'],
  ])('should say how the packages are installed', (repository, words) => {
    expect(installWords(repository.install)).toBe(words);
  });
});

describe('TrustDialog', () => {
  it('should say how it is installed now and what trusted code can reach', () => {
    const { terminal } = opened();

    const frame = frameOf(terminal);
    expect(frame).toContain('Install of example/payments');
    expect(frame).toContain('installed sandboxed, the default of');
    expect(frame).toContain('send away what is in the copy');
    expect(frame).toContain('read a credential of this computer');
    expect(frame).toMatch(/1\. Keep it as it is/u);
    expect(widestLine(frame)).toBeLessThanOrEqual(NARROW.columns);
  });

  it.each([
    ['2', 'sandboxed'],
    ['3', 'trusted'],
    ['4', null],
  ])(
    'should send the mode of answer %s once and tell what the service took',
    async (digit, mode) => {
      const { terminal, log, calls } = opened();

      await press(terminal, digit, KEYS.enter);

      await expect.poll(() => log, PATIENT).toEqual(['changed to trusted']);
      expect(calls).toEqual([
        {
          method: 'changeInstallMode',
          arguments: ['repository-payments', { mode }],
        },
      ]);
    },
  );

  it('should send nothing more while the first is on its way', async () => {
    const { terminal, calls } = opened({
      changeInstallMode: () => new Promise(() => undefined),
    });

    await press(terminal, '3', KEYS.enter, KEYS.enter);

    await expect
      .poll(() => frameOf(terminal), PATIENT)
      .toContain('Saving the mode of install');
    expect(calls).toHaveLength(1);
  });

  describe('when the first answer is confirmed', () => {
    it('should close with no change', async () => {
      const { terminal, log, calls } = opened();

      await press(terminal, KEYS.enter);

      expect(log).toEqual(['closed']);
      expect(calls).toEqual([]);
    });
  });

  describe('when the service refuses the mode', () => {
    it('should give its sentence and its code, and stay open', async () => {
      const { terminal, log } = opened({
        changeInstallMode: () => Promise.resolve(refused(400, NOT_A_MODE)),
      });

      await press(terminal, '3', KEYS.enter);

      await expect
        .poll(() => frameOf(terminal), PATIENT)
        .toContain('invalid_request');
      expect(log).toEqual([]);
    });
  });

  describe('when nothing answers', () => {
    it('should say so', async () => {
      const { terminal } = opened({
        changeInstallMode: () => Promise.reject(new Error('socket closed')),
      });

      await press(terminal, '3', KEYS.enter);

      await expect
        .poll(() => frameOf(terminal), PATIENT)
        .toContain('Nothing answered the mode of install');
    });
  });

  it('should close with no change on esc', async () => {
    const { terminal, log, calls } = opened();

    await press(terminal, KEYS.escape);

    expect(log).toEqual(['closed']);
    expect(calls).toEqual([]);
  });
});
