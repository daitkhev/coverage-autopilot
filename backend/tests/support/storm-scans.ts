import { vi } from 'vitest';

import { errorSchema } from '@coverage-autopilot/api-contracts/errors';
import { type Scan, scanSchema } from '@coverage-autopilot/api-contracts/scans';
import { snapshotListSchema } from '@coverage-autopilot/api-contracts/snapshots';
import type { ScanStatus } from '@coverage-autopilot/api-contracts/statuses';

import {
  ACCEPTED,
  type Answer,
  CONFLICT,
  OK,
} from '#tests/support/contract-ledger';
import type { SeededRandom } from '#tests/support/seeded-random';
import { choicesOf, idOf, send, type Storm } from '#tests/support/storm';

/** A scan takes a second alone, and a queue of them on a loaded machine more. */
const WORK_WAIT = { timeout: 120_000, interval: 100 };

/** Where a scan stays. */
const SCAN_ENDS: readonly ScanStatus[] = ['completed', 'failed', 'cancelled'];

/**
 * The first key of each repository is never cancelled, so every burst
 * leaves each repository a snapshot to improve from.
 */
const KEPT = 0;

/** A repository of the storm in one burst of scans, named by its phase. */
interface Place {
  readonly phase: string;
  readonly index: number;
}

interface Sent {
  readonly fullName: string;
  readonly key: string;
  readonly answer: Answer;
}

/** The scan a key stands for, as the first answer named it. */
interface KeyedScan {
  readonly key: string;
  readonly kept: boolean;
  readonly scan: Scan;
}

/** How a scan ended, and what broke on its way. */
interface Ending {
  readonly last: Scan;
  readonly findings: string[];
}

/** What a burst of scans left: what broke, and a snapshot of each repository. */
export interface ScanRound {
  readonly findings: string[];
  /** The snapshot the kept scan of each repository made, by its full name. */
  readonly snapshots: ReadonlyMap<string, string>;
}

function keyOf(place: Place, number: number): string {
  return `scan-${place.phase}-${String(place.index)}-${String(number)}`;
}

/** Its kept key first, then its own keys and now and then another's. */
function keyAt(storm: Storm, random: SeededRandom, place: Place): string {
  const { scanKeys, foreignKeyChance } = storm.sizes;
  const count = storm.repositories.length;
  if (!random.chance(foreignKeyChance)) {
    return keyOf(place, random.below(scanKeys));
  }
  const index = (place.index + 1 + random.below(count - 1)) % count;
  return keyOf({ phase: place.phase, index }, 1 + random.below(scanKeys - 1));
}

async function sentAtOnce(storm: Storm, phase: string): Promise<Sent[]> {
  const random = choicesOf(storm, `scans:${phase}`);
  const focus = random.below(storm.repositories.length);
  const { atOnce, spread } = storm.sizes;
  const asks = storm.repositories.flatMap((fullName, index) =>
    Array.from({ length: index === focus ? atOnce : spread }, (_, number) => ({
      fullName,
      key:
        number === 0
          ? keyOf({ phase, index }, KEPT)
          : keyAt(storm, random, { phase, index }),
    })),
  );
  return Promise.all(
    random.shuffled(asks).map(async (ask) => ({
      ...ask,
      answer: await send(
        storm,
        `/repositories/${idOf(storm, ask.fullName)}/scans`,
        {
          method: 'POST',
          headers: { 'Idempotency-Key': ask.key },
        },
      ),
    })),
  );
}

/**
 * One scan for one key: the first request queued it, every other one of
 * the same repository was answered with it, and one that named another
 * repository was a conflict.
 */
function keyFindings(
  storm: Storm,
  key: string,
  sent: readonly Sent[],
): string[] {
  const accepted = sent.filter(
    ({ answer }) => answer.status === ACCEPTED || answer.status === OK,
  );
  const queued = accepted.filter(({ answer }) => answer.status === ACCEPTED);
  const scans = accepted.map(({ answer }) => scanSchema.parse(answer.body));
  const ids = [...new Set(scans.map((scan) => scan.id))];
  const findings: string[] = [];
  if (ids.length !== 1 || queued.length !== 1) {
    findings.push(
      `The key ${key} queued ${String(queued.length)} scans: ${ids.join(', ')}.`,
    );
  }
  const owner = scans[0]?.repositoryId;
  const wrong = sent.filter(({ fullName, answer }) =>
    idOf(storm, fullName) === owner
      ? answer.status !== ACCEPTED && answer.status !== OK
      : answer.status !== CONFLICT ||
        errorSchema.parse(answer.body).error !== 'request_key_reused',
  );
  return [
    ...findings,
    ...wrong.map(
      ({ fullName, answer }) =>
        `The key ${key} for ${fullName} was answered ` +
        `${String(answer.status)}: ${JSON.stringify(answer.body)}.`,
    ),
  ];
}

function keyedScans(
  storm: Storm,
  sent: readonly Sent[],
  phase: string,
): KeyedScan[] {
  const kept = new Set(
    storm.repositories.map((_, index) => keyOf({ phase, index }, KEPT)),
  );
  return [...new Set(sent.map(({ key }) => key))].flatMap((key) => {
    const first = sent.find(
      (one) => one.key === key && one.answer.status !== CONFLICT,
    );
    return first === undefined
      ? []
      : [
          {
            key,
            kept: kept.has(key),
            scan: scanSchema.parse(first.answer.body),
          },
        ];
  });
}

async function settled(storm: Storm, id: string): Promise<Scan> {
  return vi.waitFor(async () => {
    const scan = scanSchema.parse((await send(storm, `/scans/${id}`)).body);
    if (!SCAN_ENDS.includes(scan.status)) {
      throw new Error(`The scan ${id} is still ${scan.status}.`);
    }
    return scan;
  }, WORK_WAIT);
}

/** Several cancels at once for a scan that may be queued, running or over. */
async function cancelsOf(storm: Storm, keyed: KeyedScan): Promise<Scan[]> {
  const random = choicesOf(storm, `scan-cancel:${keyed.key}`);
  if (keyed.kept || !random.chance(storm.sizes.cancelChance)) {
    return [];
  }
  const path = `/scans/${keyed.scan.id}/cancel`;
  const answers = await Promise.all(
    Array.from({ length: storm.sizes.cancelsAtOnce }, async () =>
      send(storm, path, { method: 'POST' }),
    ),
  );
  return answers.map((answer) => scanSchema.parse(answer.body));
}

/**
 * A scan ends once: completed with its snapshot, or cancelled with none.
 * A cancel that answered `cancelled` stays so, whatever the worker saves
 * later, and one that found the scan completed leaves it completed.
 */
function endFindings(
  keyed: KeyedScan,
  answered: readonly Scan[],
  last: Scan,
): string[] {
  const findings: string[] = [];
  const expected = keyed.kept ? ['completed'] : ['completed', 'cancelled'];
  if (!expected.includes(last.status)) {
    findings.push(
      `The scan of ${keyed.key} ended ${last.status}: ${JSON.stringify(last.failure)}.`,
    );
  }
  if ((last.status === 'completed') !== (last.snapshotId !== null)) {
    findings.push(
      `The scan of ${keyed.key} ended ${last.status} with the snapshot ${String(last.snapshotId)}.`,
    );
  }
  const told = answered
    .map((scan) => scan.status)
    .filter((status) => status !== last.status);
  if (told.length > 0) {
    findings.push(
      `A cancel of ${keyed.key} answered ${told.join(', ')}, and it ended ${last.status}.`,
    );
  }
  return findings;
}

async function ended(storm: Storm, keyed: KeyedScan): Promise<Ending> {
  const answered = await cancelsOf(storm, keyed);
  const last = await settled(storm, keyed.scan.id);
  return { last, findings: endFindings(keyed, answered, last) };
}

/** Every snapshot a completed scan made is listed with its repository. */
async function snapshotFindings(
  storm: Storm,
  lasts: readonly Scan[],
): Promise<string[]> {
  const findings: string[] = [];
  for (const fullName of storm.repositories) {
    const id = idOf(storm, fullName);
    const answer = await send(storm, `/repositories/${id}/snapshots`);
    const listed = new Set(
      snapshotListSchema
        .parse(answer.body)
        .items.map(({ id: snapshot }) => snapshot),
    );
    const missing = lasts.filter(
      (scan) =>
        scan.repositoryId === id &&
        scan.snapshotId !== null &&
        !listed.has(scan.snapshotId),
    );
    findings.push(
      ...missing.map(
        (scan) =>
          `${fullName} does not list the snapshot of the scan ${scan.id}.`,
      ),
    );
    storm.known.snapshots.push(...listed);
  }
  return findings;
}

function keptSnapshots(
  storm: Storm,
  endings: ReadonlyMap<string, Ending>,
  phase: string,
): Map<string, string> {
  return new Map(
    storm.repositories.flatMap((fullName, index) => {
      const snapshot = endings.get(keyOf({ phase, index }, KEPT))?.last
        .snapshotId;
      return snapshot === undefined || snapshot === null
        ? []
        : [[fullName, snapshot]];
    }),
  );
}

/**
 * Asks for scans of every repository many times at once, under a few
 * keys each and now and then the key of another repository, cancels some
 * of them several times at once, and waits until each has ended. It gives
 * what broke a rule, and the snapshot of each repository the burst made.
 * The phase names the burst in its keys, so no two bursts share a key.
 */
export async function scannedAtOnce(
  storm: Storm,
  phase: string,
): Promise<ScanRound> {
  const sent = await sentAtOnce(storm, phase);
  const keys = [...new Set(sent.map(({ key }) => key))];
  const asked = keys.flatMap((key) =>
    keyFindings(
      storm,
      key,
      sent.filter((one) => one.key === key),
    ),
  );
  const keyed = keyedScans(storm, sent, phase);
  storm.known.scans.push(...keyed.map(({ scan }) => scan.id));
  const endings = new Map(
    await Promise.all(
      keyed.map(async (one) => [one.key, await ended(storm, one)] as const),
    ),
  );
  const lasts = [...endings.values()].map(({ last }) => last);
  return {
    findings: [
      ...asked,
      ...[...endings.values()].flatMap(({ findings }) => findings),
      ...(await snapshotFindings(storm, lasts)),
    ],
    snapshots: keptSnapshots(storm, endings, phase),
  };
}
