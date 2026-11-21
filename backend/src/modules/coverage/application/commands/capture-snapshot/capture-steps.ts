import type { JobProgress } from '#ports/job-queue.port';

/** Hears the full list of steps each time one of them changes. */
export type ProgressObserver = (progress: JobProgress) => void;

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
  private readonly observer: ProgressObserver;
  private readonly statuses = new Map<StepCode, StepStatus>();

  public constructor(observer: ProgressObserver) {
    this.observer = observer;
  }

  /** Ends the running step as passed and starts the next one. */
  public begin(code: StepCode): void {
    this.end('passed');
    this.statuses.set(code, 'running');
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

  private end(status: StepStatus): void {
    for (const [code, current] of this.statuses) {
      if (current === 'running') {
        this.statuses.set(code, status);
      }
    }
  }

  private report(): void {
    this.observer({
      steps: STEPS.map((code) => ({
        code,
        status: this.statuses.get(code) ?? 'pending',
      })),
    });
  }
}
