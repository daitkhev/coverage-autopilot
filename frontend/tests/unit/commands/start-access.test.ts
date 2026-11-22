import { describe, expect, it } from 'vitest';

import type { AccessCheck } from '@coverage-autopilot/api-contracts/repositories';

import { accessPassed } from '#commands/start-access';
import { answered, refused } from '#tests/support/fake-service-api';
import {
  expectRefusal,
  NOT_FOUND,
  type RecordingIo,
  recordingIo,
} from '#tests/support/sample-command-io';
import {
  ACCESS_PASSED,
  ACCESS_PASSED_TO_FORK,
  ACCESS_REFUSED,
} from '#tests/support/sample-repositories';

const REPOSITORY_ID = 'repository-payments';

function checkIo(check: AccessCheck): RecordingIo {
  return recordingIo({
    checkAccess: () => Promise.resolve(answered(check)),
  });
}

describe('accessPassed', () => {
  it('should check the repository and say that a result goes to it', async () => {
    const io = checkIo(ACCESS_PASSED);

    await expect(accessPassed(REPOSITORY_ID, io)).resolves.toBe(true);

    expect(io.session.api.calls).toEqual([
      { method: 'checkAccess', arguments: [REPOSITORY_ID] },
    ]);
    expect(io.said).toEqual(['publishes    to the repository itself']);
    expect(io.printed).toEqual([]);
  });

  describe('when the account may not push to the repository', () => {
    it('should say that a result goes to a fork in the account', async () => {
      const io = checkIo(ACCESS_PASSED_TO_FORK);

      await expect(accessPassed(REPOSITORY_ID, io)).resolves.toBe(true);

      expect(io.said).toEqual([
        'publishes    to a fork in the account payments-bot',
      ]);
    });
  });

  describe('when the check did not pass', () => {
    it('should say its steps as repo check prints them', async () => {
      const io = checkIo(ACCESS_REFUSED);

      await expect(accessPassed(REPOSITORY_ID, io)).resolves.toBe(false);

      expect(io.said).toEqual([
        '✓ passed       git_present',
        '✕ failed       gh_authenticated  gh is not logged in. Run gh auth login, then check again.',
        '  └ You are not logged into any hosts. Run: gh auth login',
        '– not checked  push_allowed',
      ]);
      expect(io.printed).toEqual([]);
    });
  });

  describe('when the service refuses the check', () => {
    it('should say the refusal in its shape', async () => {
      const io = recordingIo({
        checkAccess: () => Promise.resolve(refused(404, NOT_FOUND)),
      });

      await expect(accessPassed(REPOSITORY_ID, io)).resolves.toBe(false);

      expectRefusal(io, NOT_FOUND);
    });
  });
});
