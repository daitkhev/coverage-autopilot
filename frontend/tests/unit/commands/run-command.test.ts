import { describe, expect, it } from 'vitest';

import type { ServiceApi } from '#api/service-api';
import { ServiceTimeoutError } from '#api/service-timeout-error';
import { ServiceUnreachableError } from '#api/service-unreachable-error';
import type { Command } from '#commands/command';
import { runCommand } from '#commands/run-command';
import { answered } from '#tests/support/fake-service-api';
import { recordingIo } from '#tests/support/sample-command-io';
import { REPOSITORY_LIST } from '#tests/support/sample-repositories';

const SOCKET = '/run/coverage-autopilot/service.sock';
const REPO = 'example/payments';
const ANSWER_LIMIT_MS = 30_000;

function unreachable(): Promise<never> {
  return Promise.reject(new ServiceUnreachableError(SOCKET));
}

/** A service that lists its repositories and answers nothing else. */
const GONE: Partial<ServiceApi> = {
  listRepositories: () => Promise.resolve(answered(REPOSITORY_LIST)),
  connectRepository: unreachable,
  checkAccess: unreachable,
  changeThreshold: unreachable,
  startScan: unreachable,
  listSnapshotFiles: unreachable,
  startImprovement: unreachable,
  listImprovements: unreachable,
  getImprovement: unreachable,
  getImprovementPatch: unreachable,
  approveImprovement: unreachable,
  cancelImprovement: unreachable,
  health: unreachable,
};

describe('runCommand', () => {
  it.each<[Command, keyof ServiceApi]>([
    [
      { name: 'repo add', url: 'https://github.com/acme/widgets' },
      'connectRepository',
    ],
    [{ name: 'repo check', repository: REPO }, 'checkAccess'],
    [
      { name: 'repo threshold', repository: REPO, percentage: 90 },
      'changeThreshold',
    ],
    [{ name: 'scan', repository: REPO, wait: false }, 'startScan'],
    [{ name: 'files', repository: REPO, query: {} }, 'listSnapshotFiles'],
    [
      {
        name: 'improve',
        repository: REPO,
        wait: false,
        request: { filePath: 'src/a.ts', mode: 'automatic', budget: {} },
      },
      'startImprovement',
    ],
    [{ name: 'list' }, 'listImprovements'],
    [{ name: 'status', id: 'improvement-1' }, 'getImprovement'],
    [{ name: 'patch', id: 'improvement-1' }, 'getImprovementPatch'],
    [
      { name: 'approve', id: 'improvement-1', hash: 'abc' },
      'approveImprovement',
    ],
    [{ name: 'cancel', id: 'improvement-1' }, 'cancelImprovement'],
    [{ name: 'doctor' }, 'health'],
  ])(
    'should run %j through its route and say once that nothing answers',
    async (command, route) => {
      const io = recordingIo(GONE);

      await expect(runCommand(command, io)).resolves.toBe(1);

      expect(io.session.api.calls.at(-1)?.method).toBe(route);
      expect(io.said).toEqual([
        'The service does not answer on /run/coverage-autopilot/service.sock.',
      ]);
      expect(io.printed).toEqual([]);
    },
  );

  it('should give the exit code of the command it ran', async () => {
    const io = recordingIo(GONE);

    await expect(runCommand({ name: 'repo list' }, io)).resolves.toBe(0);

    expect(io.printed).toHaveLength(REPOSITORY_LIST.items.length);
  });

  describe('when the service does not answer in time', () => {
    it('should say once how long it waited, and fail', async () => {
      const io = recordingIo({
        health: () =>
          Promise.reject(new ServiceTimeoutError(SOCKET, ANSWER_LIMIT_MS)),
      });

      await expect(runCommand({ name: 'doctor' }, io)).resolves.toBe(1);

      expect(io.said).toEqual([
        'The service on the socket /run/coverage-autopilot/service.sock did not answer in 30 seconds.',
      ]);
      expect(io.printed).toEqual([]);
    });
  });

  describe('when a command meets any other fault', () => {
    it('should not catch it', async () => {
      const io = recordingIo({
        health: () => Promise.reject(new Error('The answer was cut off.')),
      });

      await expect(runCommand({ name: 'doctor' }, io)).rejects.toThrow(
        'The answer was cut off.',
      );
      expect(io.said).toEqual([]);
    });
  });
});
