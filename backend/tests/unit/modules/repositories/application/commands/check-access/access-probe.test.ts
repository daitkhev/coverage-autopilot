import { beforeEach, describe, expect, it } from 'vitest';

import type { Repository } from '#repositories/domain/entities/repository.entity';
import { RepositoriesWorld } from '#tests/support/repositories-world';
import { SCRIPTED_HEAD } from '#tests/support/scripted-git';

const NEVER = new AbortController().signal;

let world: RepositoriesWorld;
let repository: Repository;

async function statuses(): Promise<string[]> {
  const check = await world.probe.run(repository, NEVER);
  return check.steps.map((step) => `${step.name} ${step.status}`);
}

async function failedStep(): Promise<unknown> {
  const check = await world.probe.run(repository, NEVER);
  return check.steps.find((step) => step.status === 'failed');
}

beforeEach(async () => {
  world = new RepositoriesWorld();
  repository = await world.connected();
});

describe('AccessProbe', () => {
  describe('run', () => {
    it('should pass every step and bring the head of the default branch', async () => {
      const check = await world.probe.run(repository, NEVER);

      expect(check.passed).toBe(true);
      expect(check.headCommit).toBe(SCRIPTED_HEAD);
      expect(check.checkedAt.toString()).toBe(world.clock.now().toString());
      expect(check.steps.map((step) => step.message)).toEqual([
        'Found git version 2.50.1.',
        'gh is logged in to github.com.',
        'The account may push to acme/widgets.',
      ]);
      expect(world.git.calls).toEqual(['version', 'readBranchHead main']);
      expect(world.host.calls).toEqual([
        'loginStatus github.com',
        'pushPermission',
      ]);
    });

    describe('when git is missing', () => {
      it('should fail the first step and run no other', async () => {
        world.git.versionAnswer = { outcome: 'missing' };

        expect(await statuses()).toEqual([
          'git_present failed',
          'gh_authenticated not_run',
          'push_allowed not_run',
        ]);
        expect(world.host.calls).toEqual([]);
      });
    });

    describe('when git is older than 2.36', () => {
      it('should fail the first step with the version it found', async () => {
        world.git.versionAnswer = {
          outcome: 'found',
          version: 'git version 2.35.8',
        };

        expect(await failedStep()).toEqual({
          name: 'git_present',
          status: 'failed',
          message:
            'Found git version 2.35.8, and the service needs git 2.36 or newer. Install it and check again.',
          toolOutput: null,
        });
        expect(world.host.calls).toEqual([]);
      });
    });

    describe('when git names no version', () => {
      it('should fail the first step with the answer of git', async () => {
        world.git.versionAnswer = { outcome: 'found', version: 'git 2' };

        expect(await failedStep()).toEqual({
          name: 'git_present',
          status: 'failed',
          message:
            'git answered with no version the service can read, and it needs git 2.36 or newer.',
          toolOutput: 'git 2',
        });
      });
    });

    describe('when gh is missing', () => {
      it('should fail the second step and say what to do', async () => {
        world.host.loginAnswer = { outcome: 'missing' };

        expect(await failedStep()).toEqual({
          name: 'gh_authenticated',
          status: 'failed',
          message:
            'gh is not installed, or not on the PATH of the service. Install it and check again.',
          toolOutput: null,
        });
      });
    });

    describe('when gh has no login', () => {
      it('should fail the second step with the answer of gh', async () => {
        world.host.loginAnswer = {
          outcome: 'logged_out',
          output: 'You are not logged into any GitHub hosts.',
        };

        expect(await failedStep()).toEqual({
          name: 'gh_authenticated',
          status: 'failed',
          message:
            'gh is not logged in to github.com. Run gh auth login and check again.',
          toolOutput: 'You are not logged into any GitHub hosts.',
        });
        expect(await statuses()).toContain('push_allowed not_run');
      });
    });

    describe('when the account may not push', () => {
      it('should fail the last step and read no head', async () => {
        world.host.permissionAnswer = { outcome: 'denied' };

        const check = await world.probe.run(repository, NEVER);

        expect(check.headCommit).toBeNull();
        expect(check.steps[2]?.message).toBe(
          'The account of gh may not push to acme/widgets. Ask for write access and check again.',
        );
        expect(world.git.calls).toEqual(['version']);
      });
    });

    describe('when gh cannot ask the host', () => {
      it('should fail the last step with the answer of gh', async () => {
        world.host.permissionAnswer = {
          outcome: 'refused',
          output: 'HTTP 404',
        };

        expect(await failedStep()).toMatchObject({
          name: 'push_allowed',
          message: 'gh could not ask the host about acme/widgets.',
          toolOutput: 'HTTP 404',
        });
      });
    });

    describe('when the default branch is gone', () => {
      it('should fail the last step', async () => {
        world.git.branchHeads.clear();

        expect(await failedStep()).toMatchObject({
          name: 'push_allowed',
          message: 'acme/widgets has no branch main any more.',
          toolOutput: null,
        });
      });
    });

    describe('when git cannot read the repository', () => {
      it('should fail the last step with the answer of git', async () => {
        world.git.branchHeads.set('main', {
          outcome: 'refused',
          output: 'Authentication failed',
        });

        expect(await failedStep()).toMatchObject({
          name: 'push_allowed',
          message: 'git could not read acme/widgets.',
          toolOutput: 'Authentication failed',
        });
      });
    });
  });
});
