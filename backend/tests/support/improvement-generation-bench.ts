import { GeneratingStep } from '#improvement/application/commands/run-improvement/generating.step';
import type { StepResult } from '#improvement/application/commands/run-improvement/improvement-step';
import type { Improvement } from '#improvement/domain/entities/improvement.entity';
import {
  generationCoverage,
  generationRepositories,
  scriptedGenerator,
} from '#tests/support/improvement-generation-stand-ins';
import { ImprovementRunBench } from '#tests/support/improvement-run-bench';
import { TEST_SETTINGS } from '#tests/support/improvement-values';
import { recordingQueue } from '#tests/support/recording-queue';

/**
 * The step of `generating` over stand-ins: a fresh snapshot that measures
 * the target, a generator that writes a test, and a copy that holds it.
 * A test changes a stand-in to take another path.
 */
export class GeneratingStepBench {
  public readonly runs = new ImprovementRunBench();
  public readonly repositories = generationRepositories();
  public readonly coverage = generationCoverage();
  public readonly generator = scriptedGenerator();
  public readonly queue = recordingQueue();
  public readonly step = new GeneratingStep(
    this.repositories,
    this.coverage,
    this.generator,
    this.queue,
    TEST_SETTINGS,
  );

  /** Stores the improvement and runs the step on it once. */
  public async run(improvement: Improvement): Promise<StepResult> {
    return this.step.run(await this.runs.runOf(improvement));
  }

  /** The improvement as the store keeps it now. */
  public async stored(): Promise<Improvement> {
    return this.runs.stored();
  }
}
