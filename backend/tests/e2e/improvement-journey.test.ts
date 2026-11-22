import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { errorSchema } from '@coverage-autopilot/api-contracts/errors';
import {
  type Improvement,
  improvementListSchema,
  improvementSchema,
} from '@coverage-autopilot/api-contracts/improvements';
import { repositorySchema } from '@coverage-autopilot/api-contracts/repositories';
import { scanSchema } from '@coverage-autopilot/api-contracts/scans';
import {
  type SnapshotFiles,
  snapshotFilesSchema,
} from '@coverage-autopilot/api-contracts/snapshots';
import type {
  ImprovementStatus,
  ScanStatus,
} from '@coverage-autopilot/api-contracts/statuses';

import {
  type HostedBuiltService,
  hostedBuiltService,
} from '#tests/support/hosted-built-service';
import { NEW_TESTS, TARGET } from '#tests/support/mutation-reports';
import { LOGIN_LINE } from '#tests/support/playing-engine';
import { TemporaryCodeHost } from '#tests/support/temporary-code-host';
import {
  COVERED,
  NEW_TEST_FILE,
  WIDGETS_FILES,
  WIDGETS_NAME,
} from '#tests/support/widgets-project';

/** Fictional, and in no other place, so a copy of it anywhere is found. */
const CREDENTIAL = 'fictional-generator-credential-4711';

/** A process starts in a fraction of a second, and in seconds under load. */
const START_WAIT = { timeout: 30_000, interval: 50 };

/**
 * A scan and an improvement take seconds alone. A gate that runs other
 * steps beside them makes every process of the journey slower.
 */
const WORK_WAIT = { timeout: 120_000, interval: 100 };

/** The whole journey, with both waits and the start. */
const JOURNEY_TIMEOUT_MS = 300_000;

/** Where a scan stays without a person. */
const SCAN_ENDS: readonly ScanStatus[] = ['completed', 'failed', 'cancelled'];

/** Where an improvement stays without a person or a wait of an hour. */
const IMPROVEMENT_RESTS: readonly ImprovementStatus[] = [
  'completed',
  'failed',
  'cancelled',
  'skipped',
  'awaiting_approval',
  'waiting_for_limit',
];

const FIRST_KEY = 'improve-price';

type Answer = Awaited<ReturnType<HostedBuiltService['service']['send']>>;

/** What the journey saw on its way, for the tests to judge. */
interface Journey {
  readonly files: SnapshotFiles;
  readonly requested: Answer;
  readonly improvement: Improvement;
}

let hosted: HostedBuiltService | undefined;
let journey: Journey;

function running(): HostedBuiltService {
  if (hosted === undefined) {
    throw new Error('The service of the journey did not start.');
  }
  return hosted;
}

async function send(
  path: string,
  asked?: Parameters<HostedBuiltService['service']['send']>[1],
): Promise<Answer> {
  return running().service.send(path, asked);
}

/**
 * Asks for `path` until its status is one of `rests`, and gives it then.
 * The journey runs before the tests, where only `vi.waitFor` waits.
 */
async function settled<Value extends { readonly status: string }>(
  path: string,
  schema: { parse(body: unknown): Value },
  rests: readonly string[],
): Promise<Value> {
  return vi.waitFor(async () => {
    const value = schema.parse((await send(path)).body);
    expect(rests).toContain(value.status);
    return value;
  }, WORK_WAIT);
}

/** Connects the repository and scans it, as the client does. */
async function scannedSnapshot(): Promise<string> {
  const url = TemporaryCodeHost.urlOf(WIDGETS_NAME);
  const connected = await send('/repositories', {
    method: 'POST',
    body: { url },
  });
  const { id } = repositorySchema.parse(connected.body);
  const asked = await send(`/repositories/${id}/scans`, {
    method: 'POST',
    headers: { 'Idempotency-Key': 'scan-widgets' },
  });
  const queued = scanSchema.parse(asked.body);
  const scan = await settled(`/scans/${queued.id}`, scanSchema, SCAN_ENDS);
  expect(scan).toMatchObject({ status: 'completed', failure: null });
  return String(scan.snapshotId);
}

async function walked(): Promise<Journey> {
  hosted = hostedBuiltService({
    CLAUDE_CODE_OAUTH_TOKEN: CREDENTIAL,
    AUTOPILOT_LOG_LEVEL: 'debug',
  });
  hosted.host.createRepository(WIDGETS_NAME, WIDGETS_FILES);
  await vi.waitFor(async () => send('/health'), START_WAIT);
  const snapshotId = await scannedSnapshot();
  const listed = await send(`/snapshots/${snapshotId}/files`);
  const requested = await send('/improvements', {
    method: 'POST',
    headers: { 'Idempotency-Key': FIRST_KEY },
    body: { snapshotId, filePath: TARGET },
  });
  const { id } = improvementSchema.parse(requested.body);
  const improvement = await settled(
    `/improvements/${id}`,
    improvementSchema,
    IMPROVEMENT_RESTS,
  );
  return {
    files: snapshotFilesSchema.parse(listed.body),
    requested,
    improvement,
  };
}

/** The files under `folder` whose bytes hold `text`, by their paths. */
function filesHolding(folder: string, text: string): string[] {
  return readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((path) => readFileSync(path).includes(text));
}

beforeAll(async () => {
  journey = await walked();
}, JOURNEY_TIMEOUT_MS);

afterAll(async () => {
  await hosted?.close();
});

describe('the built service, from a repository to a pull request', () => {
  it('should measure the target below the threshold of lines in the scan', () => {
    const byPath = new Map(
      journey.files.items.map((file) => [file.path, file]),
    );

    expect(journey.files.threshold).toEqual({
      metric: 'lines',
      percentage: 80,
    });
    expect(byPath.get(TARGET)).toMatchObject({
      state: 'measured',
      belowThreshold: true,
      coverage: { lines: { covered: 2, total: 3 } },
      uncoveredLines: [{ start: 3, end: 3 }],
    });
    expect(byPath.get(COVERED)).toMatchObject({
      state: 'measured',
      belowThreshold: false,
    });
  });

  it('should complete the improvement with a pull request the host holds', () => {
    const { improvement } = journey;
    const branch = `coverage-autopilot/${improvement.id}`;
    const url = `${TemporaryCodeHost.urlOf(WIDGETS_NAME)}/pull/1`;

    expect(journey.requested.status).toBe(202);
    expect(improvement).toMatchObject({
      status: 'completed',
      targetFile: TARGET,
      failure: null,
      branch,
      pullRequest: { number: 1, url },
    });
    expect(running().host.gh.pullRequests()).toEqual([
      expect.objectContaining({
        number: 1,
        url,
        head: branch,
        base: 'main',
        title: `test: cover ${TARGET}`,
      }),
    ]);
  });

  it('should push a branch that adds exactly one new test file', () => {
    const { host } = running();
    const remote = host.remoteOf(WIDGETS_NAME);
    const { baseCommit, branch } = journey.improvement;
    const head = `refs/heads/${String(branch)}`;

    expect(
      host.git(remote, 'rev-list', '--count', `${baseCommit}..${head}`),
    ).toBe('1');
    expect(host.git(remote, 'diff', '--name-status', baseCommit, head)).toBe(
      `A\t${NEW_TESTS}`,
    );
    expect(host.git(remote, 'show', `${head}:${NEW_TESTS}`)).toBe(
      NEW_TEST_FILE.trimEnd(),
    );
  });

  it('should give the credential to the generator alone', () => {
    const given = running()
      .playedRuns()
      .filter((run) => Object.values(run.variables).includes(CREDENTIAL))
      .map((run) => run.command[0]);

    expect(given).toEqual(['claude']);
  });

  it('should keep the credential out of its log and of all it stores', () => {
    const { service } = running();
    const log = service.log();
    const keptLogins = journey.improvement.attempts
      .flatMap((attempt) => attempt.rawOutputPaths)
      .map((path) => readFileSync(path, 'utf8'))
      .filter((output) => output.includes(LOGIN_LINE));

    // The line that named it was kept, so it was hidden and not lost.
    expect(keptLogins).toHaveLength(1);
    expect(log).not.toBe('');
    expect(log.split('\n').filter((line) => line.includes(CREDENTIAL))).toEqual(
      [],
    );
    expect(filesHolding(service.paths.directory, CREDENTIAL)).toEqual([]);
  });

  describe('when the key of the first request is used again for another file', () => {
    it('should refuse it with 409 and name the first improvement', async () => {
      const { improvement } = journey;

      const refused = await send('/improvements', {
        method: 'POST',
        headers: { 'Idempotency-Key': FIRST_KEY },
        body: { snapshotId: improvement.sourceSnapshotId, filePath: COVERED },
      });
      const listed = await send('/improvements');
      const body = errorSchema.parse(refused.body);

      expect(refused.status).toBe(409);
      expect(body).toMatchObject({
        error: 'request_key_reused',
        improvementId: improvement.id,
      });
      expect(body.message).toContain(improvement.id);
      expect(
        improvementListSchema.parse(listed.body).items.map((item) => item.id),
      ).toEqual([improvement.id]);
    });
  });
});
