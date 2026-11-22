import { describe, expect, it } from 'vitest';

import type { Health } from '@coverage-autopilot/api-contracts/health';

import { doctor } from '#commands/doctor';
import {
  type IoSettings,
  type RecordingIo,
  recordingIo,
} from '#tests/support/sample-command-io';
import { IDLE_HEALTH } from '#tests/support/sample-repositories';

const DOCTOR = { name: 'doctor' } as const;

function doctorIo(health: Health, settings: IoSettings = {}): RecordingIo {
  return recordingIo({ health: () => Promise.resolve(health) }, settings);
}

describe('doctor', () => {
  it('should print the state of the service as its health says it', async () => {
    const io = doctorIo(IDLE_HEALTH);

    await expect(doctor(DOCTOR, io)).resolves.toBe(0);

    expect(io.printed).toMatchInlineSnapshot(`
      [
        "service      ● service up",
        "versions     service 0.1.0, contract 5, the client reads contract 5",
        "started      3h 12m ago",
        "account      example-user",
        "generator    claude_code, subscription",
        "limits       five hours 34.0% used, opens again at 16:00; seven days unknown; seen 7m ago",
        "worker       ● alive, last seen 1s ago",
        "running      0 scans, 0 improvements",
        "tools        git 2.47.1, gh unknown",
      ]
    `);
    expect(io.said).toEqual([]);
  });

  describe('when the service knows little yet', () => {
    it('should say unknown and what it does know', async () => {
      const io = doctorIo({
        ...IDLE_HEALTH,
        ready: false,
        githubAccount: null,
        generator: { ...IDLE_HEALTH.generator, limits: null },
        worker: { alive: false, lastSeenAt: null },
        activeWork: { scans: 1, improvements: 2 },
      });

      await doctor(DOCTOR, io);

      expect(io.printed).toEqual(
        expect.arrayContaining([
          'service      ⠋ starting the service',
          'account      unknown',
          'limits       unknown',
          'worker       ✕ stopped',
          'running      1 scan, 2 improvements',
        ]),
      );
    });
  });

  describe('when the result is asked for as JSON', () => {
    it('should print the health of the contract as one document', async () => {
      const io = doctorIo(IDLE_HEALTH, { json: true });

      await expect(doctor(DOCTOR, io)).resolves.toBe(0);

      expect(io.printed).toEqual([JSON.stringify(IDLE_HEALTH)]);
    });
  });
});
