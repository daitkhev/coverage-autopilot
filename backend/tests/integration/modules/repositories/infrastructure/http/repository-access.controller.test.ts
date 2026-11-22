import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { errorSchema } from '@coverage-autopilot/api-contracts/errors';
import { accessCheckSchema } from '@coverage-autopilot/api-contracts/repositories';

import { AccessProbe } from '#repositories/application/commands/check-access/access-probe';
import { CheckAccessHandler } from '#repositories/application/commands/check-access/check-access.handler';
import type { GitVersionResult } from '#repositories/application/ports/git.port';
import { RepositoryAccessController } from '#repositories/infrastructure/http/repository-access.controller';
import {
  type HttpService,
  startHttpService,
} from '#tests/support/http-service';
import {
  RepositoriesWorld,
  WIDGETS_ID,
} from '#tests/support/repositories-world';
import { STORED_TIME } from '#tests/support/schema-rows';
import { SCRIPTED_HEAD, ScriptedGit } from '#tests/support/scripted-git';

const PATH = `/repositories/${WIDGETS_ID.value}/access`;

/** A git that answers only once its caller stops it. */
class StoppableGit extends ScriptedGit {
  public signal: AbortSignal | undefined;

  public override async version(
    signal?: AbortSignal,
  ): Promise<GitVersionResult> {
    this.signal = signal;
    await new Promise<void>((resolve) => {
      signal?.addEventListener('abort', () => {
        resolve();
      });
    });
    return { outcome: 'missing' };
  }
}

let world: RepositoriesWorld;
let service: HttpService;

async function serve(handler: CheckAccessHandler): Promise<HttpService> {
  return startHttpService({
    controllers: [RepositoryAccessController],
    providers: [{ provide: CheckAccessHandler, useValue: handler }],
  });
}

beforeEach(async () => {
  world = new RepositoriesWorld();
  await world.connected();
  service = await serve(world.checkAccess);
});

afterEach(async () => {
  await service.close();
});

describe('RepositoryAccessController', () => {
  describe('GET /repositories/:id/access', () => {
    it('should answer 200 with every step of the check and the head', async () => {
      const answer = await service.send('GET', PATH);

      expect(answer.status).toBe(200);
      expect(accessCheckSchema.parse(answer.body)).toEqual({
        repositoryId: WIDGETS_ID.value,
        checkedAt: STORED_TIME,
        passed: true,
        headCommit: SCRIPTED_HEAD.value,
        steps: [
          {
            name: 'git_present',
            status: 'passed',
            message: 'Found git version 2.50.1.',
            toolOutput: null,
          },
          {
            name: 'gh_authenticated',
            status: 'passed',
            message: 'gh is logged in to github.com.',
            toolOutput: null,
          },
          {
            name: 'push_allowed',
            status: 'passed',
            message: 'The account may push to acme/widgets.',
            toolOutput: null,
          },
        ],
      });
    });

    describe('when a step fails', () => {
      it('should answer 200 with what the tool said and the steps never run', async () => {
        world.host.loginAnswer = {
          outcome: 'logged_out',
          output: 'You are not logged into any hosts.',
        };

        const answer = await service.send('GET', PATH);

        expect(answer.status).toBe(200);
        const check = accessCheckSchema.parse(answer.body);
        expect(check).toMatchObject({ passed: false, headCommit: null });
        expect(check.steps.slice(1)).toEqual([
          {
            name: 'gh_authenticated',
            status: 'failed',
            message:
              'gh is not logged in to github.com. Run gh auth login and check again.',
            toolOutput: 'You are not logged into any hosts.',
          },
          {
            name: 'push_allowed',
            status: 'not_run',
            message: null,
            toolOutput: null,
          },
        ]);
      });
    });

    describe('when no repository has the id', () => {
      it.each([
        ['another id', '00000000-0000-4000-8000-0000000000ff'],
        ['a text that is no id', 'acme-widgets'],
      ])('should answer 404 for %s', async (_case, id) => {
        const answer = await service.send('GET', `/repositories/${id}/access`);

        expect(answer).toEqual({
          status: 404,
          body: errorSchema.parse({
            error: 'not_found',
            message: 'No connected repository has this id.',
          }),
        });
      });
    });

    describe('when the id does not match its schema', () => {
      it('should answer 400 and run no tool', async () => {
        const answer = await service.send(
          'GET',
          `/repositories/${'a'.repeat(65)}/access`,
        );

        expect(answer.status).toBe(400);
        expect(errorSchema.parse(answer.body).error).toBe('invalid_request');
        expect(world.git.calls).toEqual([]);
      });
    });

    describe('when the client goes away before the answer', () => {
      it('should stop the check with the signal of the request', async () => {
        const git = new StoppableGit();
        const probe = new AccessProbe(git, world.host, world.clock);
        await service.close();
        service = await serve(
          new CheckAccessHandler(world.repositories, probe, world.heads),
        );

        await service.abandon('GET', PATH);

        await expect.poll(() => git.signal?.aborted).toBe(true);
      });
    });
  });
});
