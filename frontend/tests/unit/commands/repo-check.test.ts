import { describe, expect, it } from 'vitest';

import type { AccessCheck } from '@coverage-autopilot/api-contracts/repositories';

import type { Command } from '#commands/command';
import { repoCheck } from '#commands/repo-check';
import { answered, refused } from '#tests/support/fake-service-api';
import {
  expectRefusal,
  type IoSettings,
  NOT_FOUND,
  type RecordingIo,
  recordingIo,
} from '#tests/support/sample-command-io';
import {
  ACCESS_PASSED,
  ACCESS_PASSED_TO_FORK,
  ACCESS_REFUSED,
  REPOSITORY_LIST,
} from '#tests/support/sample-repositories';

const CHECK: Command<'repo check'> = {
  name: 'repo check',
  repository: 'example/payments',
};

function checkIo(check: AccessCheck, settings: IoSettings = {}): RecordingIo {
  return recordingIo(
    {
      listRepositories: () => Promise.resolve(answered(REPOSITORY_LIST)),
      checkAccess: () => Promise.resolve(answered(check)),
    },
    settings,
  );
}

describe('repoCheck', () => {
  it('should check the repository it found by its name', async () => {
    const io = checkIo(ACCESS_PASSED);

    await expect(repoCheck(CHECK, io)).resolves.toBe(0);

    expect(io.session.api.calls.at(-1)).toEqual({
      method: 'checkAccess',
      arguments: ['repository-payments'],
    });
    expect(io.printed).toMatchInlineSnapshot(`
      [
        "✓ passed  git_present",
        "✓ passed  gh_authenticated",
        "✓ passed  push_allowed",
        "publishes    to the repository itself",
      ]
    `);
  });

  describe('when the account may not push to the repository', () => {
    it('should end with the account whose fork a result goes to', async () => {
      const io = checkIo(ACCESS_PASSED_TO_FORK);

      await expect(repoCheck(CHECK, io)).resolves.toBe(0);

      expect(io.printed.at(-1)).toBe(
        'publishes    to a fork in the account payments-bot',
      );
    });
  });

  describe('when a step failed', () => {
    it('should print what the tool answered under it and end with 1', async () => {
      const io = checkIo(ACCESS_REFUSED);

      await expect(repoCheck(CHECK, io)).resolves.toBe(1);

      expect(io.printed).toMatchInlineSnapshot(`
        [
          "✓ passed       git_present",
          "✕ failed       gh_authenticated  gh is not logged in. Run gh auth login, then check again.",
          "  └ You are not logged into any hosts. Run: gh auth login",
          "– not checked  push_allowed",
        ]
      `);
    });

    it('should hang each line of a longer answer under the first', async () => {
      const io = checkIo({
        ...ACCESS_REFUSED,
        steps: ACCESS_REFUSED.steps.map((step) =>
          step.status === 'failed'
            ? {
                ...step,
                toolOutput: 'error: no hosts\n\nhint: gh auth login\n',
              }
            : step,
        ),
      });

      await expect(repoCheck(CHECK, io)).resolves.toBe(1);

      expect(io.printed.slice(1)).toEqual([
        '✕ failed       gh_authenticated  gh is not logged in. Run gh auth login, then check again.',
        '  └ error: no hosts',
        '    hint: gh auth login',
        '– not checked  push_allowed',
      ]);
    });
  });

  describe('when the terminal shows no Unicode', () => {
    it('should print the ASCII of every symbol', async () => {
      const io = checkIo(ACCESS_REFUSED, { unicode: false });

      await repoCheck(CHECK, io);

      expect(io.printed).toMatchInlineSnapshot(`
        [
          "+ passed       git_present",
          "x failed       gh_authenticated  gh is not logged in. Run gh auth login, then check again.",
          "  \\ You are not logged into any hosts. Run: gh auth login",
          "- not checked  push_allowed",
        ]
      `);
    });
  });

  describe('when the result is asked for as JSON', () => {
    it('should print the check of the contract as one document', async () => {
      const io = checkIo(ACCESS_REFUSED, { json: true });

      await expect(repoCheck(CHECK, io)).resolves.toBe(1);

      expect(io.printed).toEqual([JSON.stringify(ACCESS_REFUSED)]);
    });
  });

  describe('when the service refuses the check', () => {
    it('should say the refusal in its shape and end with 1', async () => {
      const io = recordingIo({
        listRepositories: () => Promise.resolve(answered(REPOSITORY_LIST)),
        checkAccess: () => Promise.resolve(refused(404, NOT_FOUND)),
      });

      await expect(repoCheck(CHECK, io)).resolves.toBe(1);

      expectRefusal(io, NOT_FOUND);
    });
  });

  describe('when no repository has the name', () => {
    it('should check nothing and end with 1', async () => {
      const io = checkIo(ACCESS_PASSED);

      await expect(
        repoCheck({ ...CHECK, repository: 'acme/widgets' }, io),
      ).resolves.toBe(1);

      expect(io.session.api.calls.map((call) => call.method)).toEqual([
        'listRepositories',
      ]);
    });
  });
});
