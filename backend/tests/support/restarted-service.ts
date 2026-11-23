import { setTimeout as delay } from 'node:timers/promises';

import { vi } from 'vitest';

import type { InstancePaths } from '#infrastructure/config/instance-paths';
import {
  type BuiltService,
  startBuiltService,
} from '#tests/support/built-service';
import {
  createInstanceFolder,
  type InstanceFolder,
} from '#tests/support/instance-folder';
import type { askOver } from '#tests/support/service-bench';

type Answer = Awaited<ReturnType<typeof askOver>>;

/** How long to wait, and how often to look again. */
export interface Wait {
  readonly timeout: number;
  readonly interval: number;
}

/** How a start that was stopped ended. */
export interface EndedStart {
  readonly exitCode: number | null;
  /** Everything it wrote to its log. */
  readonly log: string;
}

/** What `waits` a service is given: for an answer, and for its end. */
interface Waits {
  /** For a start to answer, through the stops and starts between. */
  readonly answer: Wait;
  /** For a process that was told to end, or killed, to be gone. */
  readonly endMs: number;
}

/** The lines of the log a failure shows, the last ones. */
const LAST_LINES = 20;

async function tooLate(
  ms: number,
  signal: AbortSignal,
  late: () => string,
): Promise<never> {
  await delay(ms, undefined, { signal });
  throw new Error(late());
}

/** The work, or a failure that `late` words once `ms` passed. */
async function within<Value>(
  work: Promise<Value>,
  ms: number,
  late: () => string,
): Promise<Value> {
  const timer = new AbortController();
  try {
    return await Promise.race([work, tooLate(ms, timer.signal, late)]);
  } finally {
    timer.abort();
  }
}

/** Says what a start did not do in time, and how its log ends. */
function lateStart(what: string, service: BuiltService): () => string {
  return () => {
    const tail = service.log().split('\n').slice(-LAST_LINES).join('\n');
    return `The service ${what}. The end of its log:\n${tail}`;
  };
}

/**
 * The built service of one instance, started again and again on it, one
 * process at a time: a start begins only once the one before it ended.
 * A client sends its requests to whichever start is up, as a client of a
 * service that is stopped and started again does.
 */
export class RestartedService {
  public readonly paths: InstancePaths;
  private readonly instance: InstanceFolder;
  private readonly variables: Readonly<Record<string, string>>;
  private readonly waits: Waits;
  private readonly starts: BuiltService[] = [];
  private closed = false;

  public constructor(
    variables: Readonly<Record<string, string>>,
    waits: Waits,
  ) {
    this.instance = createInstanceFolder();
    this.paths = this.instance.paths;
    this.variables = {
      ...variables,
      AUTOPILOT_INSTANCE_DIR: this.paths.directory,
    };
    this.waits = waits;
  }

  /**
   * Starts a service on the instance, unless it was closed: a run that
   * went on past the end of its test starts no process nobody ends.
   */
  public start(): void {
    if (this.closed) {
      throw new Error('The instance is closed, so no service starts on it.');
    }
    this.starts.push(startBuiltService(this.variables));
  }

  /**
   * Sends the request until a start of the service answers it. A request
   * a stop cut off is sent again, as it is, so a request that changes
   * something carries what makes it the same request.
   */
  public async send(
    path: string,
    asked?: Parameters<BuiltService['send']>[1],
  ): Promise<Answer> {
    return vi.waitFor(
      async () => this.latest().send(path, asked),
      this.waits.answer,
    );
  }

  /**
   * Sends the latest start a signal, and gives its code and its whole log
   * once it exited and its log ended, which a program it left running
   * may keep open.
   */
  public async stop(signal: NodeJS.Signals): Promise<EndedStart> {
    const service = this.latest();
    service.signal(signal);
    const ms = this.waits.endMs;
    const exitCode = await within(
      service.exitCode,
      ms,
      lateStart(`did not exit within ${String(ms)} ms of ${signal}`, service),
    );
    const log = await within(
      service.errors,
      ms,
      lateStart(`exited, and its log stayed open ${String(ms)} ms`, service),
    );
    return { exitCode, log };
  }

  /** What each start wrote to its log, in the order they started. */
  public logs(): string[] {
    return this.starts.map((service) => service.log());
  }

  /** Ends every start that still runs, and removes the instance. */
  public async close(): Promise<void> {
    this.closed = true;
    try {
      for (const service of this.starts) {
        await service.close();
      }
    } finally {
      this.instance.remove();
    }
  }

  private latest(): BuiltService {
    const service = this.starts.at(-1);
    if (service === undefined) {
      throw new Error('The service of the instance was never started.');
    }
    return service;
  }
}
