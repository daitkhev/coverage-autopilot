import { existsSync } from 'node:fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RepositoryUrl } from '#repositories/domain/value-objects/repository-url.vo';
import { GhNotAuthenticatedError } from '#repositories/infrastructure/errors/gh-not-authenticated.error';
import { UnexpectedToolOutputError } from '#repositories/infrastructure/errors/unexpected-tool-output.error';
import { GhCodeHost } from '#repositories/infrastructure/gh/gh-code-host.adapter';
import { WORK_WAIT } from '#tests/support/hosted-service';
import { RecordingLogger } from '#tests/support/recording-logger';
import { TemporaryCodeHost } from '#tests/support/temporary-code-host';
import { TOOL_CLOCK } from '#tests/support/tool-lines';

const WIDGETS = 'acme/widgets';
const URL_OF_WIDGETS = RepositoryUrl.parse(TemporaryCodeHost.urlOf(WIDGETS));
const NEVER = new AbortController().signal;

let host: TemporaryCodeHost;
let gh: GhCodeHost;
let first: string;

/** gh that prints `text` and ends with 0, whatever it is asked. */
function printing(text: string): GhCodeHost {
  const script = `console.log(${JSON.stringify(text)})`;
  return new GhCodeHost(
    {
      ...host.settings,
      gh: {
        ...host.settings.gh,
        command: [process.execPath, '--eval', script, '--'],
      },
    },
    new RecordingLogger(),
    TOOL_CLOCK,
  );
}

/** The commit `main` of a repository of the host is at. */
function mainOf(fullName: string): string {
  return host.git(host.remoteOf(fullName), 'rev-parse', 'refs/heads/main');
}

beforeEach(() => {
  host = new TemporaryCodeHost();
  gh = new GhCodeHost(host.settings, new RecordingLogger(), TOOL_CLOCK);
  first = host.createRepository(WIDGETS, { 'src/a.ts': 'export {};\n' });
});

afterEach(() => {
  host.remove();
});

describe('GhCodeHost', () => {
  describe('account', () => {
    it('should answer the login of the account gh uses on the host', async () => {
      expect(await gh.account('github.com', NEVER)).toEqual({
        outcome: 'read',
        login: 'acme-bot',
      });
      expect(host.gh.calls()[0]?.arguments).toEqual([
        'api',
        '--hostname=github.com',
        'user',
      ]);
    });

    describe('when gh cannot ask the host', () => {
      it('should answer refused with what gh said', async () => {
        host.gh.answer({ loggedIn: false });

        expect(await gh.account('github.com', NEVER)).toEqual({
          outcome: 'refused',
          output: 'To get started with GitHub CLI, please run: gh auth login',
        });
      });
    });

    describe('when gh prints no account', () => {
      it('should throw UnexpectedToolOutputError', async () => {
        await expect(
          printing('{"login":""}').account('github.com', NEVER),
        ).rejects.toThrow(UnexpectedToolOutputError);
      });
    });
  });

  describe('ensureFork', () => {
    it('should ask the host for a fork and give the one it named', async () => {
      const forked = await gh.ensureFork(URL_OF_WIDGETS, NEVER);

      expect(forked).toEqual({
        outcome: 'forked',
        fork: RepositoryUrl.parse('https://github.com/acme-bot/widgets'),
      });
      expect(host.gh.calls()[0]?.arguments).toEqual([
        'api',
        '--method=POST',
        'repos/acme/widgets/forks',
      ]);
      expect(mainOf('acme-bot/widgets')).toBe(first);
    });

    it('should give the same fork when asked again, and make none', async () => {
      await gh.ensureFork(URL_OF_WIDGETS, NEVER);
      const fork = host.remoteOf('acme-bot/widgets');
      host.git(fork, 'update-ref', 'refs/heads/mine', first);

      const again = await gh.ensureFork(URL_OF_WIDGETS, NEVER);

      expect(again).toMatchObject({ outcome: 'forked' });
      expect(again.outcome === 'forked' && again.fork.fullName).toBe(
        'acme-bot/widgets',
      );
      expect(host.git(fork, 'rev-parse', 'refs/heads/mine')).toBe(first);
      expect(existsSync(host.remoteOf('acme-bot/widgets-1'))).toBe(false);
    });

    describe('when the account has a repository of that name already', () => {
      it('should give the fork under the name the host chose', async () => {
        host.createRepository('acme-bot/widgets', { 'own.txt': 'own\n' });

        const forked = await gh.ensureFork(URL_OF_WIDGETS, NEVER);

        expect(forked.outcome === 'forked' && forked.fork.fullName).toBe(
          'acme-bot/widgets-1',
        );
        expect(mainOf('acme-bot/widgets-1')).toBe(first);
      });
    });

    describe('when the host makes the fork in the background', () => {
      it('should name the fork at once, which git reaches later', async () => {
        host.gh.answer({ forkDelayMs: 300 });

        const forked = await gh.ensureFork(URL_OF_WIDGETS, NEVER);

        expect(forked).toMatchObject({ outcome: 'forked' });
        expect(existsSync(host.remoteOf('acme-bot/widgets'))).toBe(false);
        await vi.waitFor(() => {
          expect(mainOf('acme-bot/widgets')).toBe(first);
        }, WORK_WAIT);
      });
    });

    describe('when the host will not fork', () => {
      it('should answer refused with what gh said', async () => {
        host.gh.answer({
          forkRefusal: 'gh: Forking is disabled. (HTTP 403)\n',
        });

        expect(await gh.ensureFork(URL_OF_WIDGETS, NEVER)).toEqual({
          outcome: 'refused',
          output: 'gh: Forking is disabled. (HTTP 403)',
        });
      });
    });

    describe('when gh has no login', () => {
      it('should throw GhNotAuthenticatedError', async () => {
        host.gh.answer({ loggedIn: false });

        await expect(gh.ensureFork(URL_OF_WIDGETS, NEVER)).rejects.toThrow(
          GhNotAuthenticatedError,
        );
      });
    });

    describe('when gh names what is no fork on the host', () => {
      it.each([
        [
          'a repository that is no fork',
          '{"fork":false,"clone_url":"https://github.com/acme/widgets.git"}',
        ],
        [
          'an address of another host',
          '{"fork":true,"clone_url":"https://example.com/acme-bot/widgets.git"}',
        ],
        ['no address', '{"fork":true}'],
      ])(
        'should throw UnexpectedToolOutputError for %s',
        async (_case, text) => {
          await expect(
            printing(text).ensureFork(URL_OF_WIDGETS, NEVER),
          ).rejects.toThrow(UnexpectedToolOutputError);
        },
      );
    });
  });
});
