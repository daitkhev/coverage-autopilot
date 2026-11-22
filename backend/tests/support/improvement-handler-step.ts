import type { ImprovementRun } from '#improvement/application/commands/run-improvement/improvement-run';
import type {
  ImprovementStep,
  StepResult,
} from '#improvement/application/commands/run-improvement/improvement-step';
import type { Change } from '#improvement/application/commands/run-improvement/run-failures';
import type { FailureReason } from '#improvement/domain/value-objects/improvement-failure.vo';
import type { ImprovementStatus } from '#improvement/domain/value-objects/improvement-status.vo';

type Script = (run: ImprovementRun) => Promise<StepResult>;

/**
 * The step of a status that does what a test scripts and keeps every run
 * it was given. Until a test scripts it, it saves nothing and goes on.
 */
export class ScriptedStep implements ImprovementStep {
  public readonly status: ImprovementStatus;
  public readonly faultReason: FailureReason;
  public readonly runs: ImprovementRun[] = [];
  private script: Script = async () => Promise.resolve({ next: 'continue' });

  public constructor(status: ImprovementStatus, faultReason: FailureReason) {
    this.status = status;
    this.faultReason = faultReason;
  }

  public does(script: Script): void {
    this.script = script;
  }

  /** Saves the change through the run and goes on. */
  public saves(change: Change): void {
    this.does(async (run) => {
      await run.save(change);
      return { next: 'continue' };
    });
  }

  public async run(run: ImprovementRun): Promise<StepResult> {
    this.runs.push(run);
    return this.script(run);
  }
}
