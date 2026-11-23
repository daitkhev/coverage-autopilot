import type { ImprovementRun } from '#improvement/application/commands/run-improvement/improvement-run';
import type { JobProgress } from '#ports/job-queue.port';
import type { BaselineProgress } from '#verification/application/contracts/verification-public-api';

/** The two steps before the gate, then the four the gate reports. */
type AnalysisStep =
  'revision_check' | 'fresh_snapshot' | BaselineProgress['step'];

type StepStatus = JobProgress['steps'][number]['status'];

const STEPS: readonly AnalysisStep[] = [
  'revision_check',
  'fresh_snapshot',
  'prepare',
  'type_check',
  'existing_tests',
  'mutation_baseline',
];

/**
 * The steps of `analyzing` as a person watches them. Progress is a hint:
 * nothing reads it back, so each change sends the whole list again, and
 * a report that is lost costs nothing.
 */
export class AnalysisProgress {
  private readonly run: Pick<ImprovementRun, 'reportProgress'>;
  private readonly statuses = new Map<AnalysisStep, StepStatus>();
  /** The analysis starts with the check of the revision. */
  private current: AnalysisStep = 'revision_check';

  public constructor(run: Pick<ImprovementRun, 'reportProgress'>) {
    this.run = run;
  }

  /** Every step is pending as the phase starts. */
  public begin(): void {
    this.send();
  }

  public start(step: AnalysisStep): void {
    this.current = step;
    this.mark('running');
  }

  /** Ends the step that ran last as passed. */
  public pass(): void {
    this.mark('passed');
  }

  /** Ends the step that ran last as failed. */
  public fail(): void {
    this.mark('failed');
  }

  /** What the gate says of its own steps: one starts, or one is done. */
  public hear(progress: BaselineProgress): void {
    this.current = progress.step;
    this.mark(progress.status === 'running' ? 'running' : 'passed');
  }

  private mark(status: StepStatus): void {
    this.statuses.set(this.current, status);
    this.send();
  }

  private send(): void {
    this.run.reportProgress({
      steps: STEPS.map((code) => ({
        code,
        status: this.statuses.get(code) ?? 'pending',
      })),
    });
  }
}
