import { beforeEach, describe, expect, it } from 'vitest';

import { CommitSha } from '#kernel/primitives/commit-sha';
import type { Alarm } from '#ports/alarm.port';
import { PublicationTargets } from '#repositories/application/commands/publish-patch/publication-targets';
import { ForkNotReadyError } from '#repositories/application/errors/fork-not-ready.error';
import { PermissionNotReadError } from '#repositories/application/errors/permission-not-read.error';
import type { Repository } from '#repositories/domain/entities/repository.entity';
import { BranchName } from '#repositories/domain/value-objects/branch-name.vo';
import { RepositoriesWorld } from '#tests/support/repositories-world';
import { SCRIPTED_FORK } from '#tests/support/scripted-code-host';

const NEVER = new AbortController().signal;
const BASE = CommitSha.create('c'.repeat(40));
const NOT_THERE = {
  outcome: 'refused',
  output: "fatal: repository 'https://github.com/acme-bot/widgets/' not found",
} as const;

let world: RepositoriesWorld;
let repository: Repository;

/** The moments of the alarms, as milliseconds after the start. */
function waits(start: number): number[] {
  return world.alarm.moments.map((moment) => moment.epochMilliseconds - start);
}

beforeEach(async () => {
  world = new RepositoriesWorld();
  repository = await world.connected();
});

describe('PublicationTargets', () => {
  describe('of', () => {
    it('should send a result to the repository and its default branch when the account may push', async () => {
      expect(await world.targets.of(repository, BASE, NEVER)).toEqual({
        outcome: 'found',
        target: {
          route: 'repository',
          url: repository.url,
          base: BranchName.create('main'),
        },
      });
      expect(world.host.calls).toEqual(['pushPermission']);
    });

    describe('when the host does not say whether the account may push', () => {
      it('should throw PermissionNotReadError with what gh said, which a later try may not meet', async () => {
        world.host.permissionAnswer = {
          outcome: 'refused',
          output: 'HTTP 502',
        };

        const finding = world.targets.of(repository, BASE, NEVER);

        await expect(finding).rejects.toThrow(PermissionNotReadError);
        await expect(finding).rejects.toThrow('It said: HTTP 502');
        await expect(finding).rejects.toMatchObject({
          code: 'permission_not_read',
          retryable: true,
        });
        expect(world.host.calls).toEqual(['pushPermission']);
      });
    });

    describe('when the account may not push', () => {
      beforeEach(() => {
        world.host.permissionAnswer = { outcome: 'denied' };
      });

      it('should target the fork the host named, and a base branch named by the whole commit', async () => {
        expect(await world.targets.of(repository, BASE, NEVER)).toEqual({
          outcome: 'found',
          target: {
            route: 'fork',
            url: SCRIPTED_FORK,
            base: BranchName.create(`coverage-autopilot/base-${BASE.value}`),
          },
        });
        expect(world.host.calls).toEqual([
          'pushPermission',
          'ensureFork acme/widgets',
        ]);
        expect(world.git.calls).toEqual(['readDefaultBranch acme-bot/widgets']);
        expect(world.alarm.moments).toEqual([]);
      });

      it('should look again every two seconds until git reaches a new fork', async () => {
        const start = world.clock.now().epochMilliseconds;
        world.git.earlierDefaultBranchAnswers.push(NOT_THERE, NOT_THERE);

        const found = await world.targets.of(repository, BASE, NEVER);

        expect(found.outcome).toBe('found');
        expect(waits(start)).toEqual([2000, 4000]);
        expect(world.git.calls).toHaveLength(3);
      });

      it('should throw ForkNotReadyError once git has not reached the fork for a minute', async () => {
        const start = world.clock.now().epochMilliseconds;
        world.git.defaultBranchAnswer = NOT_THERE;

        const finding = world.targets.of(repository, BASE, NEVER);

        await expect(finding).rejects.toThrow(ForkNotReadyError);
        await expect(finding).rejects.toThrow(
          `git did not reach the fork acme-bot/widgets within 60000 ms of asking for it. It said: ${NOT_THERE.output}`,
        );
        await expect(finding).rejects.toMatchObject({
          code: 'fork_not_ready',
          retryable: true,
        });
        expect(waits(start).at(-1)).toBe(60_000);
        expect(world.alarm.moments).toHaveLength(30);
      });

      it('should answer refused in the words of the host when it will not fork', async () => {
        world.host.forkAnswer = { outcome: 'refused', output: 'HTTP 403' };

        expect(await world.targets.of(repository, BASE, NEVER)).toEqual({
          outcome: 'refused',
          reason: 'HTTP 403',
        });
        expect(world.git.calls).toEqual([]);
      });

      describe('when the signal aborts while it waits', () => {
        it('should take the alarm back and throw the reason of the signal', async () => {
          const controller = new AbortController();
          const reason = new Error('The job was stopped.');
          let taken = false;
          const stopping: Alarm = {
            set: () => {
              controller.abort(reason);
              return () => {
                taken = true;
              };
            },
          };
          const targets = new PublicationTargets(
            world.host,
            world.git,
            world.clock,
            stopping,
          );
          world.git.defaultBranchAnswer = NOT_THERE;

          await expect(
            targets.of(repository, BASE, controller.signal),
          ).rejects.toBe(reason);
          expect(taken).toBe(true);
          expect(world.git.calls).toHaveLength(1);
        });
      });

      describe('when the signal aborted before the wait', () => {
        it('should set no alarm and throw the reason of the signal', async () => {
          const reason = new Error('The service stops.');
          world.git.defaultBranchAnswer = NOT_THERE;

          await expect(
            world.targets.of(repository, BASE, AbortSignal.abort(reason)),
          ).rejects.toBe(reason);
          expect(world.alarm.moments).toEqual([]);
        });
      });
    });
  });
});
