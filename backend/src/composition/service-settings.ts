import type { Writable } from 'node:stream';

import type { ServiceConfig } from '#infrastructure/config/service-config';
import type { LogSettings } from '#infrastructure/logging/log-settings';
import type { JobWorkerSettings } from '#infrastructure/queue/job-worker-settings';
import type { SandboxSettings } from '#infrastructure/sandbox/sandbox-settings';
import type { RepositoriesModule } from '#repositories/repositories.module';

/** The settings of the repositories module, as its module file takes them. */
type RepositoriesSettings = Parameters<typeof RepositoriesModule.register>[0];

/** Lines, because they match what people expect to read. */
const THRESHOLD_METRIC = 'lines';

/** Both are found on the `PATH` of the environment they are started with. */
const GIT_COMMAND = ['git'];
const GH_COMMAND = ['gh'];

/**
 * The variables of git and of gh whose values are tokens of the host of
 * the code, which the module keeps out of its errors and its output.
 */
const HOST_SECRET_VARIABLES = ['GH_TOKEN', 'GITHUB_TOKEN'];

/** What the root module gives the shared adapters and the modules it wires. */
export interface ServiceSettings {
  readonly log: LogSettings;
  readonly worker: JobWorkerSettings;
  readonly sandbox: SandboxSettings;
  /** The folder of the store of tool output. */
  readonly artifacts: string;
  readonly repositories: RepositoriesSettings;
}

/**
 * The one place that turns the configuration into settings. The log goes
 * to `logStream`, which only the entry file may name.
 */
export function serviceSettingsOf(
  config: ServiceConfig,
  logStream: Writable,
): ServiceSettings {
  return {
    log: { stream: logStream, level: config.logLevel, secrets: config.secrets },
    worker: {
      leaseMs: config.queue.leaseMs,
      heartbeatMs: config.queue.heartbeatMs,
      maxRuns: config.queue.maxRuns,
      pollMs: config.queue.pollMs,
      jobsAtOnce: config.queue.concurrency,
    },
    sandbox: config.sandbox,
    artifacts: config.instance.artifacts,
    repositories: {
      threshold: {
        metric: THRESHOLD_METRIC,
        percentage: config.coverageThreshold,
      },
      workingCopiesRoot: config.instance.workingCopies,
      git: { command: GIT_COMMAND, ...config.git },
      gh: { command: GH_COMMAND, ...config.gh },
      secretVariables: HOST_SECRET_VARIABLES,
    },
  };
}
