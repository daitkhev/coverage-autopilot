import type { JobProgress } from '#ports/job-queue.port';
import type { Logger } from '#ports/logger.port';

/** Hears the full list of steps each time one of them changes. */
type ProgressObserver = (progress: JobProgress) => void;

/** Who follows a capture: a person through the progress, and the log. */
export interface CaptureWatch {
  readonly progress: ProgressObserver;
  /**
   * Hears when each step starts and how it ends, with the ids of the
   * journey the capture is part of. A capture that is itself a step of
   * another journey has none, and that journey writes its own step.
   */
  readonly log?: Logger;
}

type StepCode = 'clone' | 'install' | 'test_run' | 'read_report';

type StepStatus = JobProgress['steps'][number]['status'];

const STEPS: readonly StepCode[] = [
  'clone',
  'install',
  'test_run',
  'read_report',
];

/**
 * The steps of a capture as a person watches them. Progress is a hint:
 * nothing reads it back, so each change sends the whole list again.
 */
export class CaptureSteps {
  private readonly watch: CaptureWatch;
  private readonly statuses = new Map<StepCode, StepStatus>();

  public constructor(watch: CaptureWatch) {
    this.watch = watch;
  }

  /** Ends the running step as passed and starts the next one. */
  public begin(code: StepCode): void {
    this.end('passed');
    this.statuses.set(code, 'running');
    this.watch.log?.info('A step of a scan started.', { step: code });
    this.report();
  }

  public pass(): void {
    this.end('passed');
    this.report();
  }

  public fail(): void {
    this.end('failed');
    this.report();
  }

  /**
   * A fault or a stop left the running step. The progress is left as it
   * is, since the job decides what comes next, and the log hears it.
   */
  public interrupt(): void {
    for (const code of this.running()) {
      this.ended(code, 'interrupted');
    }
  }

  private end(status: StepStatus): void {
    for (const code of this.running()) {
      this.statuses.set(code, status);
      this.ended(code, status);
    }
  }

  private running(): StepCode[] {
    return [...this.statuses]
      .filter(([, status]) => status === 'running')
      .map(([code]) => code);
  }

  private ended(code: StepCode, outcome: string): void {
    this.watch.log?.info('A step of a scan ended.', { step: code, outcome });
  }

  private report(): void {
    this.watch.progress({
      steps: STEPS.map((code) => ({
        code,
        status: this.statuses.get(code) ?? 'pending',
      })),
    });
  }
}
