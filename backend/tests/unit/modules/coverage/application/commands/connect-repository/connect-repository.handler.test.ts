import { beforeEach, describe, expect, it } from 'vitest';

import { ConnectRepositoryHandler } from '#coverage/application/commands/connect-repository/connect-repository.handler';
import {
  heldBy,
  type RepositoryViewWorld,
  repositoryViewWorld,
} from '#tests/support/repository-view-world';
import { runningScanJob, SCAN_ID } from '#tests/support/scan-jobs';

const NEVER = new AbortController().signal;

const URL = 'https://github.com/acme/widgets';

let world: RepositoryViewWorld;
let handler: ConnectRepositoryHandler;

beforeEach(() => {
  world = repositoryViewWorld();
  handler = new ConnectRepositoryHandler(world.connections, world.views);
});

describe('ConnectRepositoryHandler', () => {
  describe('execute', () => {
    it('should connect the address through its module and give the repository as it is seen', async () => {
      const result = await handler.execute({ url: URL }, NEVER);

      expect(result).toEqual({
        outcome: 'connected',
        repository: {
          ...heldBy(world.repositories),
          latestSnapshot: null,
          activeScanId: null,
          outdated: false,
        },
      });
      expect(world.connections.urls).toEqual([URL]);
    });

    describe('when it was connected before', () => {
      it('should give it with what the coverage module knows of it', async () => {
        world.connections.answer = {
          outcome: 'already_connected',
          repository: heldBy(world.repositories),
        };
        world.queue.jobs.set(SCAN_ID, runningScanJob());

        const result = await handler.execute({ url: URL }, NEVER);

        expect(result).toMatchObject({
          outcome: 'already_connected',
          repository: { activeScanId: SCAN_ID },
        });
      });
    });

    describe.each([
      ['invalid_url', 'The address is not one of a repository.'],
      ['unreachable', 'git could not read acme/widgets.'],
    ] as const)('when the module answers %s', (outcome, reason) => {
      it('should pass the refusal on as it is', async () => {
        world.connections.answer = { outcome, reason };

        expect(await handler.execute({ url: URL }, NEVER)).toEqual({
          outcome,
          reason,
        });
      });
    });
  });
});
