import { afterEach, describe, expect, it } from 'vitest';

import { errorSchema } from '@coverage-autopilot/api-contracts/errors';
import { improvementListSchema } from '@coverage-autopilot/api-contracts/improvements';
import { repositorySchema } from '@coverage-autopilot/api-contracts/repositories';
import { type Scan, scanSchema } from '@coverage-autopilot/api-contracts/scans';
import { snapshotFilesSchema } from '@coverage-autopilot/api-contracts/snapshots';

import {
  type HostedService,
  hostedService,
  WORK_WAIT,
} from '#tests/support/hosted-service';
import { lockfileOf } from '#tests/support/project-folder';
import { TemporaryCodeHost } from '#tests/support/temporary-code-host';

const PROJECT = {
  'package.json': JSON.stringify({
    name: 'widgets',
    devDependencies: { jest: '^30.5.2' },
  }),
  'package-lock.json': lockfileOf({ jest: '30.5.2' }),
  'src/sum.ts': 'export const sum = (a: number, b: number) => a + b;\n',
};

const ENDED = new Set(['completed', 'failed', 'cancelled']);

let hosted: HostedService;

afterEach(async () => {
  await hosted.close();
});

/**
 * Connects `acme/widgets` and asks for its scan over the socket, as the
 * client does, and waits until the worker has ended it.
 */
async function scanned(): Promise<Scan> {
  hosted.host.createRepository('acme/widgets', PROJECT);
  await hosted.bench.run();
  const connected = await hosted.send('/repositories', {
    method: 'POST',
    body: { url: TemporaryCodeHost.urlOf('acme/widgets') },
  });
  const { id } = repositorySchema.parse(connected.body);
  const asked = await hosted.send(`/repositories/${id}/scans`, {
    method: 'POST',
    headers: { 'Idempotency-Key': 'scan-1' },
  });
  let scan = scanSchema.parse(asked.body);
  const path = `/scans/${scan.id}`;
  await expect
    .poll(async () => {
      scan = scanSchema.parse((await hosted.send(path)).body);
      return ENDED.has(scan.status);
    }, WORK_WAIT)
    .toBe(true);
  return scan;
}

/** The program and the arguments each container was started with. */
function containerCommands(): string[][] {
  return hosted
    .engineCalls()
    .filter((call) => call.arguments[0] === 'run')
    .map((call) => {
      const image = call.arguments.indexOf('node:26-slim');
      return call.arguments.slice(image + 1);
    });
}

describe('a scan asked over the socket', () => {
  it('should install and run the tests in the sandbox, and keep a snapshot', async () => {
    hosted = hostedService({ exitCode: 0 });

    const scan = await scanned();
    const snapshot = `/snapshots/${String(scan.snapshotId)}/files`;
    const files = await hosted.send(snapshot);

    expect(scan).toMatchObject({ status: 'completed', failure: null });
    expect(containerCommands().map((command) => command[0])).toEqual([
      'npm',
      'node',
    ]);
    // The stand-in writes no report, so the file was not measured.
    expect(snapshotFilesSchema.parse(files.body).items).toEqual([
      {
        path: 'src/sum.ts',
        state: 'unmeasured',
        reason: 'missing_from_report',
        toolMessage: null,
      },
    ]);
  });

  describe('when the install fails', () => {
    it('should fail the scan with the reason the engine gave', async () => {
      hosted = hostedService({
        exitCode: 1,
        output: [{ stream: 'stderr', text: 'npm error 404 Not Found\n' }],
      });

      const scan = await scanned();

      expect(scan).toMatchObject({
        status: 'failed',
        snapshotId: null,
        failure: { reason: 'install_failed' },
      });
      expect(containerCommands()).toHaveLength(1);
    });
  });

  describe('when an improvement is asked with no credential of the generator', () => {
    it('should refuse it with 409 and store nothing', async () => {
      hosted = hostedService({ exitCode: 0 });
      const scan = await scanned();

      const refused = await hosted.send('/improvements', {
        method: 'POST',
        headers: { 'Idempotency-Key': 'improve-1' },
        body: { snapshotId: scan.snapshotId, filePath: 'src/sum.ts' },
      });
      const listed = await hosted.send('/improvements');

      expect(refused.status).toBe(409);
      expect(errorSchema.parse(refused.body).error).toBe(
        'generator_unavailable',
      );
      expect(improvementListSchema.parse(listed.body).items).toEqual([]);
    });
  });
});
