import { setTimeout as delay } from 'node:timers/promises';

import { vi } from 'vitest';

import { errorSchema } from '@coverage-autopilot/api-contracts/errors';
import {
  type Improvement,
  improvementSchema,
} from '@coverage-autopilot/api-contracts/improvements';
import { repositorySchema } from '@coverage-autopilot/api-contracts/repositories';
import { type Scan, scanSchema } from '@coverage-autopilot/api-contracts/scans';

import { TARGET } from '#tests/support/mutation-reports';
import type { RestartedService, Wait } from '#tests/support/restarted-service';
import { TemporaryCodeHost } from '#tests/support/temporary-code-host';
import { COVERED } from '#tests/support/widgets-project';

type Answer = Awaited<ReturnType<RestartedService['send']>>;

/** A scan asked for under a key, as it ended. */
interface KeyedScan {
  readonly key: string;
  readonly scan: Scan;
}

/** What a client asked of one repository, and how it ended. */
export interface RepositoryWork {
  /** As the code host names it. */
  readonly name: string;
  readonly repositoryId: string;
  readonly scans: readonly KeyedScan[];
  /** Each improvement the requests made, as it ended. */
  readonly improvements: readonly Improvement[];
  /** The first answer to improve the target. */
  readonly asked: Answer | null;
  /** The answer to the same work asked again under another key. */
  readonly again: Answer | null;
  /** The answer to the cancel of the first improvement, if one was sent. */
  readonly cancel: Answer | null;
}

/** What a client is to do with one repository. */
export interface Errand {
  /** As the code host names the repository. */
  readonly name: string;
  /** How long after asking to improve the target it cancels it, if ever. */
  readonly cancelAfterMs: number | null;
}

/** Who asks, and how long a final state is waited for. */
export interface Client {
  readonly service: RestartedService;
  readonly wait: Wait;
}

/** Where a scan stays without a person. */
const SCAN_ENDS: ReadonlySet<string> = new Set([
  'completed',
  'failed',
  'cancelled',
]);

/** Where the first improvement of some work gives way to a new one. */
const GAVE_WAY: ReadonlySet<string> = new Set(['failed', 'cancelled']);

const CONFLICT = 409;

/** Where an improvement stays without a person or a wait of an hour. */
const IMPROVEMENT_RESTS: ReadonlySet<string> = new Set([
  'completed',
  'failed',
  'cancelled',
  'skipped',
  'awaiting_approval',
  'waiting_for_limit',
]);

/** Answers `path` once it is in one of `rests`. */
async function rested<Value extends { readonly status: string }>(
  client: Client,
  path: string,
  read: {
    readonly schema: { parse(body: unknown): Value };
    readonly rests: ReadonlySet<string>;
  },
): Promise<Value> {
  return vi.waitFor(async () => {
    const value = read.schema.parse((await client.service.send(path)).body);
    if (!read.rests.has(value.status)) {
      throw new Error(`${path} is ${value.status} still.`);
    }
    return value;
  }, client.wait);
}

async function scanned(
  client: Client,
  repositoryId: string,
  key: string,
): Promise<KeyedScan> {
  const asked = await client.service.send(
    `/repositories/${repositoryId}/scans`,
    { method: 'POST', headers: { 'Idempotency-Key': key } },
  );
  const { id } = scanSchema.parse(asked.body);
  const scan = await rested(client, `/scans/${id}`, {
    schema: scanSchema,
    rests: SCAN_ENDS,
  });
  return { key, scan };
}

async function askedToImprove(
  client: Client,
  key: string,
  body: { readonly snapshotId: string; readonly filePath: string },
): Promise<Answer> {
  return client.service.send('/improvements', {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
    body,
  });
}

/** Each improvement the answers made, once it rests. */
async function improvementsOf(
  client: Client,
  answers: readonly Answer[],
): Promise<Improvement[]> {
  const made = answers.flatMap((answer) => {
    const parsed = improvementSchema.safeParse(answer.body);
    return parsed.success ? [parsed.data.id] : [];
  });
  return Promise.all(
    [...new Set(made)].map(async (id) =>
      rested(client, `/improvements/${id}`, {
        schema: improvementSchema,
        rests: IMPROVEMENT_RESTS,
      }),
    ),
  );
}

function idOf(answer: Answer | null): string | undefined {
  return improvementSchema.safeParse(answer?.body).data?.id;
}

/** Cancels the improvement the answer made, once `afterMs` passed. */
async function cancelled(
  client: Client,
  answer: Answer,
  afterMs: number | null,
): Promise<Answer | null> {
  const id = idOf(answer);
  if (afterMs === null || id === undefined) {
    return null;
  }
  await delay(afterMs);
  return client.service.send(`/improvements/${id}/cancel`, {
    method: 'POST',
    body: {},
  });
}

/**
 * Asks to improve the target of the snapshot and the file it covers
 * whole, and the target again under another key: the same work. The
 * repository is scanned once more meanwhile, and the target is cancelled
 * when the errand says so.
 */
async function improved(
  client: Client,
  work: Pick<RepositoryWork, 'name' | 'repositoryId' | 'scans'>,
  errand: Errand & { readonly snapshotId: string },
): Promise<RepositoryWork> {
  const key = work.name.replace('/', '-');
  const { snapshotId } = errand;
  const target = { snapshotId, filePath: TARGET };
  const asked = await askedToImprove(client, `${key}-improve`, target);
  const again = await askedToImprove(client, `${key}-again`, target);
  const covered = await askedToImprove(client, `${key}-covered`, {
    snapshotId,
    filePath: COVERED,
  });
  const [second, cancel, improvements] = await Promise.all([
    scanned(client, work.repositoryId, `${key}-second-scan`),
    cancelled(client, asked, errand.cancelAfterMs),
    improvementsOf(client, [asked, again, covered]),
  ]);
  const scans = [...work.scans, second];
  return { ...work, scans, improvements, asked, again, cancel };
}

/**
 * Connects the repository, scans it and asks to improve two of its files,
 * each request sent again until a start of the service answered it, and
 * waits until each piece of work ended.
 */
export async function workOn(
  client: Client,
  errand: Errand,
): Promise<RepositoryWork> {
  const { name } = errand;
  const connected = await client.service.send('/repositories', {
    method: 'POST',
    body: { url: TemporaryCodeHost.urlOf(name) },
  });
  const repositoryId = repositorySchema.parse(connected.body).id;
  const key = name.replace('/', '-');
  const first = await scanned(client, repositoryId, `${key}-first-scan`);
  const work = { name, repositoryId, scans: [first] };
  const { snapshotId } = first.scan;
  return snapshotId === null
    ? { ...work, improvements: [], asked: null, again: null, cancel: null }
    : improved(client, work, { ...errand, snapshotId });
}

function refusedFor(answer: Answer | null, id: string | undefined): boolean {
  const refusal = errorSchema.safeParse(answer?.body);
  return (
    answer?.status === CONFLICT &&
    refusal.success &&
    refusal.data.improvementId === id
  );
}

/**
 * What is wrong with the answer to the same work under another key, or
 * `null`. It is refused, and the refusal names the first improvement,
 * unless the first failed or was cancelled: then a new one is made.
 */
export function wrongRepeat(work: RepositoryWork): string | null {
  const firstId = idOf(work.asked);
  const first = work.improvements.find(({ id }) => id === firstId);
  const madeAnew =
    idOf(work.again) !== undefined && GAVE_WAY.has(String(first?.status));
  return refusedFor(work.again, firstId) || madeAnew
    ? null
    : `${work.name} answered ${JSON.stringify(work.again)}`;
}

/** The improvements a cancel was sent for, as the cancel answered them. */
export function cancelAnswers(work: readonly RepositoryWork[]): Improvement[] {
  return work.flatMap(({ cancel }) => {
    const answered = improvementSchema.safeParse(cancel?.body);
    return answered.success ? [answered.data] : [];
  });
}
