import type {
  DeadJobContext,
  JobContext,
  JobHandler,
  JobOutcome,
  JobResult,
} from '#ports/job-handler.port';
import type { JobKind } from '#ports/job-queue.port';

/** One call of `execute`, which the test ends when and how it wants. */
export interface ScriptedRun {
  readonly context: JobContext;
  readonly finish: (outcome?: JobOutcome) => void;
  readonly retry: () => void;
  readonly fail: (error: unknown) => void;
}

const DONE: JobOutcome = { version: 1, done: true };

/**
 * A handler that does nothing by itself: each run waits until the test
 * ends it, so a test decides what happens between a claim and its end.
 */
export class ScriptedJobHandler implements JobHandler {
  public readonly kind: JobKind;
  public readonly runs: ScriptedRun[] = [];
  public readonly exhausted: DeadJobContext[] = [];
  private refusals = 0;
  private stopsWhenAborted = false;

  public constructor(kind: JobKind) {
    this.kind = kind;
  }

  public async execute(context: JobContext): Promise<JobResult> {
    const result = Promise.withResolvers<JobResult>();
    if (this.stopsWhenAborted) {
      context.signal.addEventListener('abort', () => {
        const reason: unknown = context.signal.reason;
        result.reject(reason);
      });
    }
    this.runs.push({
      context,
      finish: (outcome = DONE) => {
        result.resolve({ status: 'finished', outcome });
      },
      retry: () => {
        result.resolve({
          status: 'retry',
          reason: { code: 'tool_busy', message: 'The tool was busy.' },
        });
      },
      fail: (error) => {
        result.reject(error);
      },
    });
    return result.promise;
  }

  public async onRetriesExhausted(context: DeadJobContext): Promise<void> {
    this.exhausted.push(context);
    if (this.refusals > 0) {
      this.refusals -= 1;
      return Promise.reject(new Error('The store of the subject was busy.'));
    }
    return Promise.resolve();
  }

  /** From now on a run throws the reason of its signal once aborted. */
  public stopWhenAborted(): void {
    this.stopsWhenAborted = true;
  }

  /** The next call of `onRetriesExhausted` hears it and then fails. */
  public refuseNextExhausted(): void {
    this.refusals += 1;
  }

  /** The run that started last. */
  public latest(): ScriptedRun {
    const run = this.runs.at(-1);
    if (run === undefined) {
      throw new Error('No run of the handler has started.');
    }
    return run;
  }
}
