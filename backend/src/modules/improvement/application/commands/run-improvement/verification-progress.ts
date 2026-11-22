import { CHECK_NAMES } from '#improvement/domain/value-objects/quality-policy.vo';
import type { JobProgress } from '#ports/job-queue.port';
import type { CheckProgress } from '#verification/application/contracts/verification-public-api';

type ProgressStep = JobProgress['steps'][number];

/** Where progress goes: to the job, which keeps the latest list. */
type ProgressReport = (progress: JobProgress) => void;

/**
 * The seven checks of the gate as the steps of the phase, in their
 * order. A check is `pending` until the gate names it, and each change
 * gives the whole list again, so a report that is lost costs nothing.
 */
export class VerificationProgress {
  private readonly report: ProgressReport;
  private steps: readonly ProgressStep[] = CHECK_NAMES.map((code) => ({
    code,
    status: 'pending',
  }));

  public constructor(report: ProgressReport) {
    this.report = report;
  }

  /** The phase starts with every check pending. */
  public begin(): void {
    this.report({ steps: this.steps });
  }

  /** What the gate said of one check, with its count when it repeats. */
  public heard(progress: CheckProgress): void {
    const { check, ...told } = progress;
    this.steps = this.steps.map((step) =>
      step.code === check ? { code: check, ...told } : step,
    );
    this.report({ steps: this.steps });
  }

  /**
   * The phase is over once the verdict is saved. Whatever comes next,
   * another phase or a run that starts again, shows none of its steps.
   */
  public end(): void {
    this.report({ steps: [] });
  }
}
