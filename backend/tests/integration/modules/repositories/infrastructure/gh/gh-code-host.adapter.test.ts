import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BranchName } from '#repositories/domain/value-objects/branch-name.vo';
import { RepositoryUrl } from '#repositories/domain/value-objects/repository-url.vo';
import { GhNotAuthenticatedError } from '#repositories/infrastructure/errors/gh-not-authenticated.error';
import { ToolFailedError } from '#repositories/infrastructure/errors/tool-failed.error';
import { ToolStoppedError } from '#repositories/infrastructure/errors/tool-stopped.error';
import { ToolTimedOutError } from '#repositories/infrastructure/errors/tool-timed-out.error';
import { UnexpectedToolOutputError } from '#repositories/infrastructure/errors/unexpected-tool-output.error';
import { GhCodeHost } from '#repositories/infrastructure/gh/gh-code-host.adapter';
import type { RepositoriesSettings } from '#repositories/infrastructure/repositories-settings';
import {
  SECRET_TOKEN,
  TemporaryCodeHost,
} from '#tests/support/temporary-code-host';

const URL_OF_WIDGETS = RepositoryUrl.parse('https://github.com/acme/widgets');
const BRANCH = BranchName.create('coverage/src-a-ts');
const MAIN = BranchName.create('main');
const NEVER = new AbortController().signal;

let host: TemporaryCodeHost;
let gh: GhCodeHost;

function withGh(change: Partial<RepositoriesSettings['gh']>): GhCodeHost {
  return new GhCodeHost({
    ...host.settings,
    gh: { ...host.settings.gh, ...change },
  });
}

async function open(): Promise<unknown> {
  return gh.openPullRequest(
    {
      url: URL_OF_WIDGETS,
      branch: BRANCH,
      base: MAIN,
      title: '--title of a test',
      body: 'Covers the branches of src/a.ts.',
    },
    NEVER,
  );
}

beforeEach(() => {
  host = new TemporaryCodeHost();
  gh = new GhCodeHost(host.settings);
});

afterEach(() => {
  host.remove();
});

describe('GhCodeHost', () => {
  describe('loginStatus', () => {
    it('should answer logged in for the host it names', async () => {
      expect(await gh.loginStatus('github.com', NEVER)).toEqual({
        outcome: 'logged_in',
      });
      expect(host.gh.calls()[0]?.arguments).toEqual([
        'auth',
        'status',
        '--hostname=github.com',
      ]);
    });

    describe('when gh has no login', () => {
      it('should answer logged out with what gh said', async () => {
        host.gh.answer({ loggedIn: false, statusText: '' });

        expect(await gh.loginStatus('github.com', NEVER)).toEqual({
          outcome: 'logged_out',
          output: 'You are not logged into any GitHub hosts.',
        });
      });

      it('should hide a secret of the environment in what it keeps', async () => {
        host.gh.answer({
          loggedIn: false,
          statusText: `The token in GH_TOKEN, ${SECRET_TOKEN}, is invalid.\n`,
        });

        const status = await gh.loginStatus('github.com', NEVER);

        expect(JSON.stringify(status)).not.toContain(SECRET_TOKEN);
        expect(JSON.stringify(status)).toContain('[hidden], is invalid');
      });
    });

    describe('when no gh is on the path it was given', () => {
      it('should answer missing', async () => {
        const status = await withGh({
          command: ['no-such-gh-of-the-test'],
          environment: { PATH: host.folder },
        }).loginStatus('github.com', NEVER);

        expect(status).toEqual({ outcome: 'missing' });
      });
    });

    describe('when gh runs longer than its time limit', () => {
      it('should throw ToolTimedOutError', async () => {
        host.gh.answer({ hangs: true });

        await expect(
          withGh({ timeoutMs: 1 }).loginStatus('github.com', NEVER),
        ).rejects.toThrow(ToolTimedOutError);
      });
    });

    describe('when the signal of the caller aborts', () => {
      it('should stop gh and throw ToolStoppedError', async () => {
        host.gh.answer({ hangs: true });
        const controller = new AbortController();
        const status = gh.loginStatus('github.com', controller.signal);

        controller.abort();

        await expect(status).rejects.toThrow(ToolStoppedError);
      });
    });
  });

  describe('pushPermission', () => {
    it('should answer allowed when the account may push', async () => {
      expect(await gh.pushPermission(URL_OF_WIDGETS, NEVER)).toEqual({
        outcome: 'allowed',
      });
      expect(host.gh.calls()[0]?.arguments).toEqual([
        'api',
        'repos/acme/widgets',
      ]);
    });

    it('should answer denied when the account may not push', async () => {
      host.gh.answer({ canPush: false });

      expect(await gh.pushPermission(URL_OF_WIDGETS, NEVER)).toEqual({
        outcome: 'denied',
      });
    });

    describe('when gh cannot ask the host', () => {
      it('should answer refused with what gh said', async () => {
        host.gh.answer({ loggedIn: false });

        expect(await gh.pushPermission(URL_OF_WIDGETS, NEVER)).toEqual({
          outcome: 'refused',
          output: 'To get started with GitHub CLI, please run: gh auth login',
        });
      });
    });

    describe('when gh prints what is not the repository', () => {
      it('should throw UnexpectedToolOutputError', async () => {
        await expect(
          withGh({
            command: [process.execPath, '--eval', 'console.log("{")', '--'],
          }).pushPermission(URL_OF_WIDGETS, NEVER),
        ).rejects.toThrow(UnexpectedToolOutputError);
      });
    });
  });

  describe('findPullRequest', () => {
    it('should answer null when the branch has no pull request', async () => {
      expect(
        await gh.findPullRequest(
          { url: URL_OF_WIDGETS, branch: BRANCH },
          NEVER,
        ),
      ).toBeNull();
      expect(host.gh.calls()[0]?.arguments).toEqual([
        'pr',
        'list',
        '--repo=acme/widgets',
        '--head=coverage/src-a-ts',
        '--state=all',
        '--json=number,url',
        '--limit=1',
      ]);
    });

    it('should find the pull request of the branch', async () => {
      await open();

      expect(
        await gh.findPullRequest(
          { url: URL_OF_WIDGETS, branch: BRANCH },
          NEVER,
        ),
      ).toEqual({
        number: 1,
        url: 'https://github.com/acme/widgets/pull/1',
      });
    });

    describe('when gh has no login', () => {
      it('should throw GhNotAuthenticatedError', async () => {
        host.gh.answer({ loggedIn: false });

        await expect(
          gh.findPullRequest({ url: URL_OF_WIDGETS, branch: BRANCH }, NEVER),
        ).rejects.toThrow(GhNotAuthenticatedError);
      });
    });

    describe('when gh fails for another reason', () => {
      it('should throw ToolFailedError', async () => {
        await expect(
          withGh({
            command: [process.execPath, '--eval', 'process.exitCode = 1', '--'],
          }).findPullRequest({ url: URL_OF_WIDGETS, branch: BRANCH }, NEVER),
        ).rejects.toThrow(ToolFailedError);
      });
    });
  });

  describe('openPullRequest', () => {
    it('should open the pull request and give its number and address', async () => {
      expect(await open()).toEqual({
        outcome: 'opened',
        pullRequest: {
          number: 1,
          url: 'https://github.com/acme/widgets/pull/1',
        },
      });
      expect(host.gh.calls()[0]).toEqual({
        arguments: [
          'pr',
          'create',
          '--repo=acme/widgets',
          '--base=main',
          '--head=coverage/src-a-ts',
          '--title=--title of a test',
          '--body-file=-',
        ],
        input: 'Covers the branches of src/a.ts.',
      });
    });

    describe('when the host refuses it', () => {
      it('should answer refused with what gh said', async () => {
        host.gh.answer({ createRefusal: 'No commits between main and it.' });

        expect(await open()).toEqual({
          outcome: 'refused',
          output: 'No commits between main and it.',
        });
      });
    });

    describe('when gh has no login', () => {
      it('should throw GhNotAuthenticatedError with no secret in it', async () => {
        host.gh.answer({ loggedIn: false });

        const opening = open();

        await expect(opening).rejects.toThrow(GhNotAuthenticatedError);
        await expect(opening).rejects.not.toThrow(SECRET_TOKEN);
      });
    });

    describe('when gh prints no address of a pull request', () => {
      it('should throw UnexpectedToolOutputError', async () => {
        await expect(
          withGh({
            command: [process.execPath, '--eval', 'console.log("done")', '--'],
          }).openPullRequest(
            {
              url: URL_OF_WIDGETS,
              branch: BRANCH,
              base: MAIN,
              title: 't',
              body: 'b',
            },
            NEVER,
          ),
        ).rejects.toThrow(UnexpectedToolOutputError);
      });
    });
  });
});
