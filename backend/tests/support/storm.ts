import { createHash } from 'node:crypto';

import { vi } from 'vitest';

import {
  type Answer,
  type Asked,
  ContractLedger,
} from '#tests/support/contract-ledger';
import {
  type HostedBuiltService,
  hostedBuiltService,
} from '#tests/support/hosted-built-service';
import { type SeededRandom, seededRandom } from '#tests/support/seeded-random';
import { WIDGETS_FILES } from '#tests/support/widgets-project';

/** The bytes of a hash the seed of a label is read from. */
const SEED_BYTES = 4;

/** A process starts in a fraction of a second, and in seconds under load. */
const START_WAIT = { timeout: 30_000, interval: 50 };

/** How many requests a storm sends at once, and how often it does what. */
export interface StormSizes {
  /** Requests at once for the one repository or file a burst falls on. */
  readonly atOnce: number;
  /** Requests at once for each of the others in the same burst. */
  readonly spread: number;
  /** The keys of scans a repository is asked with in one round. */
  readonly scanKeys: number;
  /** The keys of requests for one file in one round. */
  readonly requestKeys: number;
  /** Keys never used, under which the work of an ended improvement is asked again. */
  readonly freshKeys: number;
  /** Cancels sent together for one scan or one improvement. */
  readonly cancelsAtOnce: number;
  /** Approvals sent together for one improvement. */
  readonly approvalsAtOnce: number;
  /** The chance that a scan or an improvement is cancelled. */
  readonly cancelChance: number;
  /** The chance that a request for a scan takes a key of another repository. */
  readonly foreignKeyChance: number;
  /** The chance that an approval names a patch the person never saw. */
  readonly wrongHashChance: number;
}

/** The ids a run learned, for the reads to ask for. */
interface KnownIds {
  readonly scans: string[];
  readonly snapshots: string[];
  readonly improvements: string[];
}

/** One service, its repositories, and every choice and answer of a run. */
export interface Storm {
  readonly seed: number;
  readonly sizes: StormSizes;
  readonly hosted: HostedBuiltService;
  readonly ledger: ContractLedger;
  /** The full names of the repositories on the host of the code. */
  readonly repositories: readonly string[];
  /** The id the service gave each repository, by its full name. */
  readonly ids: Map<string, string>;
  readonly known: KnownIds;
}

export interface StormSettings {
  readonly seed: number;
  readonly sizes: StormSizes;
  readonly repositoryCount: number;
  /** Variables of the service besides those that reach the stand-ins. */
  readonly variables: Readonly<Record<string, string>>;
}

/** Sends a request over the socket, and judges its answer by the contract. */
export async function send(
  storm: Storm,
  path: string,
  asked: Asked = {},
): Promise<Answer> {
  return storm.ledger.send(path, asked);
}

/**
 * Choices of a run about one thing, named by `label`, such as the cancels
 * of one scan. Each label draws from a seed made of the seed of the run
 * and the label, so a choice does not hang on how many were made before
 * it, nor on the order the service answered in.
 */
export function choicesOf(storm: Storm, label: string): SeededRandom {
  const digest = createHash('sha256')
    .update(`${String(storm.seed)}:${label}`)
    .digest();
  return seededRandom(digest.readUInt32BE(digest.length - SEED_BYTES));
}

/** The id of a repository the run registered. */
export function idOf(storm: Storm, fullName: string): string {
  const id = storm.ids.get(fullName);
  if (id === undefined) {
    throw new Error(`${fullName} was not registered in the run.`);
  }
  return id;
}

/**
 * Starts the built service over a host with the repositories of a storm,
 * each a copy of the project of the journey, and waits until it answers.
 * The wait asks past the ledger, because a socket that is not there yet
 * is no breach of the contract.
 */
export async function startedStorm(settings: StormSettings): Promise<Storm> {
  const hosted = hostedBuiltService(settings.variables);
  try {
    const repositories = Array.from(
      { length: settings.repositoryCount },
      (_, index) => `acme/storm-${String(index)}`,
    );
    for (const fullName of repositories) {
      hosted.host.createRepository(fullName, WIDGETS_FILES);
    }
    await vi.waitFor(async () => hosted.service.send('/health'), START_WAIT);
    return {
      seed: settings.seed,
      sizes: settings.sizes,
      hosted,
      ledger: new ContractLedger(hosted.service.paths.socket),
      repositories,
      ids: new Map(),
      known: { scans: [], snapshots: [], improvements: [] },
    };
  } catch (error) {
    await hosted.close();
    throw error;
  }
}
