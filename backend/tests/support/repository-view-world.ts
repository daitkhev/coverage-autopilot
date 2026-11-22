import { RepositoryViews } from '#coverage/application/dto/repository-views';
import type {
  ConnectRepositoryResult,
  RepositoryConnectionsApi,
  RepositoryDto,
} from '#repositories/contracts/repositories-public-api';
import {
  type InMemorySnapshots,
  inMemorySnapshots,
} from '#tests/support/coverage-stand-ins';
import {
  type RecordingQueue,
  recordingQueue,
} from '#tests/support/recording-queue';
import { COVERAGE_TEST_SETTINGS } from '#tests/support/recording-sandbox';
import {
  type StandInRepositories,
  standInRepositories,
} from '#tests/support/stand-in-repositories';

export interface StandInConnections extends RepositoryConnectionsApi {
  /** What `connectRepository` answers. */
  answer: ConnectRepositoryResult;
  /** Every address it was asked to connect. */
  readonly urls: string[];
  /** The signal of each of those calls. */
  readonly signals: AbortSignal[];
  /** Answers only once the signal aborts, and then throws its reason. */
  holds: boolean;
}

/** The repository the stand-in of the repositories module holds now. */
export function heldBy(repositories: StandInRepositories): RepositoryDto {
  if (repositories.repository === null) {
    throw new Error('The stand-in of the repositories holds no repository.');
  }
  return repositories.repository;
}

/**
 * The connected repositories over the stand-in of the repositories
 * module: they are the one repository it holds, if it holds one, and
 * connecting answers that one as `connected` until a test says otherwise.
 */
export function standInConnections(
  repositories: StandInRepositories,
): StandInConnections {
  const connections: StandInConnections = {
    answer: { outcome: 'connected', repository: heldBy(repositories) },
    urls: [],
    signals: [],
    holds: false,
    connectRepository: async ({ url }, signal) => {
      connections.urls.push(url);
      connections.signals.push(signal);
      if (connections.holds) {
        await new Promise((resolve) => {
          signal.addEventListener('abort', resolve, { once: true });
        });
        signal.throwIfAborted();
      }
      return connections.answer;
    },
    listRepositories: async () =>
      Promise.resolve(
        repositories.repository === null ? [] : [repositories.repository],
      ),
  };
  return connections;
}

/** What a repository is seen with, over stand-ins in memory. */
export interface RepositoryViewWorld {
  /** `acme/widgets`, with no head read. */
  readonly repositories: StandInRepositories;
  readonly connections: StandInConnections;
  /** No snapshot at first. */
  readonly snapshots: InMemorySnapshots;
  /** No job at first. */
  readonly queue: RecordingQueue;
  readonly views: RepositoryViews;
}

export function repositoryViewWorld(): RepositoryViewWorld {
  const repositories = standInRepositories();
  const snapshots = inMemorySnapshots();
  const queue = recordingQueue();
  return {
    repositories,
    connections: standInConnections(repositories),
    snapshots,
    queue,
    views: new RepositoryViews(snapshots, queue, COVERAGE_TEST_SETTINGS),
  };
}
