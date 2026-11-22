import { existsSync } from 'node:fs';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CONTRACT_VERSION,
  type Health,
  healthSchema,
  stopServiceResultSchema,
} from '@coverage-autopilot/api-contracts/health';

import {
  type BuiltService,
  startBuiltService,
} from '#tests/support/built-service';

/** A process starts in a fraction of a second, and in seconds under load. */
const START_WAIT = { timeout: 30_000, interval: 50 };

const services: BuiltService[] = [];

function started(variables: Record<string, string> = {}): BuiltService {
  const service = startBuiltService(variables);
  services.push(service);
  return service;
}

/** The health of a service, asked until its socket answers. */
async function healthOf(service: BuiltService): Promise<Health> {
  const answer = await vi.waitFor(
    async () => service.send('/health'),
    START_WAIT,
  );
  return healthSchema.parse(answer.body);
}

afterEach(async () => {
  for (const service of services.splice(0)) {
    await service.close();
  }
});

describe('the built service', () => {
  it('should answer its health over the socket of its instance', async () => {
    const health = await healthOf(started());

    expect(health).toMatchObject({
      ready: true,
      contractVersion: CONTRACT_VERSION,
      worker: { alive: true },
      activeWork: { scans: 0, improvements: 0 },
    });
  });

  describe('when it is asked over the socket to stop', () => {
    it('should answer, exit with 0 and leave no socket', async () => {
      const service = started();
      await healthOf(service);

      const answer = await service.send('/service/stop', { method: 'POST' });

      expect(stopServiceResultSchema.parse(answer.body).stopping).toBe(true);
      await expect(service.exitCode).resolves.toBe(0);
      expect(existsSync(service.paths.socket)).toBe(false);
    });
  });

  describe('when the process is told to end', () => {
    it('should exit with 0 and leave no socket', async () => {
      const service = started();
      await healthOf(service);

      service.signal('SIGTERM');

      await expect(service.exitCode).resolves.toBe(0);
      expect(existsSync(service.paths.socket)).toBe(false);
    });
  });

  describe('when another service holds the instance', () => {
    it('should exit with 0 and leave the first one serving', async () => {
      const first = started();
      const { startedAt } = await healthOf(first);

      const second = started({
        AUTOPILOT_INSTANCE_DIR: first.paths.directory,
      });

      await expect(second.exitCode).resolves.toBe(0);
      await expect(healthOf(first)).resolves.toMatchObject({ startedAt });
    });
  });

  describe('when a variable cannot be read', () => {
    it('should exit with 1 and name the variable in one line', async () => {
      const service = started({ AUTOPILOT_QUEUE_POLL_MS: 'soon' });

      await expect(service.exitCode).resolves.toBe(1);
      const errors = await service.errors;

      expect(errors).toContain('AUTOPILOT_QUEUE_POLL_MS');
      expect(errors.trimEnd().split('\n')).toHaveLength(1);
    });
  });
});
