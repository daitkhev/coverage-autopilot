import { afterEach, describe, expect, it } from 'vitest';

import { errorSchema } from '@coverage-autopilot/api-contracts/errors';
import { improvementListSchema } from '@coverage-autopilot/api-contracts/improvements';
import { type Scan, scanSchema } from '@coverage-autopilot/api-contracts/scans';

import {
  askedScan,
  type HostedService,
  hostedService,
  WORK_WAIT,
} from '#tests/support/hosted-service';
import { journeyIn } from '#tests/support/journey-lines';
import { giveBackFolders } from '#tests/support/locked-tree';
import { SECRET_TOKEN } from '#tests/support/temporary-code-host';

const ENDED = new Set(['completed', 'failed', 'cancelled']);

/**
 * No snapshot has this id. The refusal comes before any snapshot is read.
 */
const SOME_SNAPSHOT = '0190a1b2-c3d4-7e5f-8a6b-9c0d1e2f3a4b';

let hosted: HostedService;

afterEach(async () => {
  giveBackFolders(hosted.bench.config.instance.directory);
  await hosted.close();
});

/**
 * Connects `acme/widgets` and asks for its scan over the socket, as the
 * client does, and waits until the worker has ended it.
 */
async function scanned(): Promise<Scan> {
  await hosted.bench.run();
  let scan = await askedScan(hosted);
  const path = `/scans/${scan.id}`;
  await expect
    .poll(async () => {
      scan = scanSchema.parse((await hosted.send(path)).body);
      return ENDED.has(scan.status);
    }, WORK_WAIT)
    .toBe(true);
  return scan;
}

/** The lines at info of a scan, whose job has the id of the scan. */
function journeyOf(scanId: string): string[] {
  return journeyIn(
    hosted.bench.logText(),
    (fields) => fields['jobId'] === scanId,
  );
}

/** The program and the arguments each container was started with. */
function containerCommands(): string[][] {
  return hosted
    .engineCalls()
    .filter((call) => call.arguments[0] === 'run')
    .map((call) => {
      const image = call.arguments.indexOf('coverage-autopilot-sandbox:26');
      return call.arguments.slice(image + 1);
    });
}

describe('a scan asked over the socket', () => {
  describe('when the test runner ends and wrote no report', () => {
    it('should fail the scan with that reason after both commands ran', async () => {
      // The stand-in of the engine runs nothing, so no report is written.
      hosted = hostedService({ exitCode: 0 });

      const scan = await scanned();

      expect(containerCommands().map((command) => command[0])).toEqual([
        'npm',
        'node',
      ]);
      expect(scan).toMatchObject({
        status: 'failed',
        snapshotId: null,
        failure: { reason: 'coverage_report_missing' },
      });
    });
  });

  describe('when the log is read after the scan', () => {
    it('should tell its journey at info, and each program it started at debug, with no secret', async () => {
      hosted = hostedService({ exitCode: 0 }, { AUTOPILOT_LOG_LEVEL: 'debug' });

      const scan = await scanned();

      const ended = 'A job ended. completed coverage_report_missing';
      await expect.poll(() => journeyOf(scan.id).at(-1), WORK_WAIT).toBe(ended);
      expect(journeyOf(scan.id)).toEqual([
        'A job was taken.',
        'A step of a scan started. clone',
        'A step of a scan ended. clone passed',
        'A step of a scan started. install',
        'A step of a scan ended. install passed',
        'A step of a scan started. test_run',
        'A step of a scan ended. test_run passed',
        'A step of a scan started. read_report',
        'A step of a scan ended. read_report failed',
        ended,
      ]);
      const programs = hosted.bench
        .logLines()
        .filter((line) => line.message === 'A program ended.')
        .map((line) => line.fields['program']);
      expect(programs).toContain('git');
      expect(programs).toContain(hosted.bench.config.sandbox.engine.command[0]);
      expect(hosted.bench.logText()).not.toContain(SECRET_TOKEN);
    });
  });

  describe('when its working copy cannot be removed after the scan', () => {
    it('should keep the end of the scan, and say in the log which copy stays', async () => {
      hosted = hostedService({ exitCode: 0, locksCopies: true });

      const scan = await scanned();

      expect(scan).toMatchObject({
        status: 'failed',
        failure: { reason: 'coverage_report_missing' },
      });
      expect(hosted.bench.logLines()).toContainEqual(
        expect.objectContaining({
          level: 'error',
          message:
            'A working copy could not be removed, so its folders stay on disk.',
          fields: expect.objectContaining({
            errorCode: 'working_copy_not_removed',
          }) as unknown,
        }),
      );
    });
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
      await hosted.bench.run();

      const refused = await hosted.send('/improvements', {
        method: 'POST',
        headers: { 'Idempotency-Key': 'improve-1' },
        body: { snapshotId: SOME_SNAPSHOT, filePath: 'src/sum.ts' },
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
