import type { FileCoverageDto } from '#coverage/contracts/coverage-public-api';
import type { ImprovementSettings } from '#improvement/application/improvement-settings';
import type {
  GenerationLimits,
  GenerationRequest,
  GenerationTarget,
  MutantHint,
  RejectionFeedback,
} from '#improvement/application/ports/test-generator.port';
import type { Improvement } from '#improvement/domain/entities/improvement.entity';
import type { Mutant } from '#improvement/domain/value-objects/mutant.vo';
import type { Instant } from '#kernel/time/instant';

/** A call is never given less: a limit of zero would stop it at once. */
const LEAST_TIMEOUT_MS = 1;

/** What the fresh snapshot of `analyzing` says of the target. */
export interface GenerationSubject {
  readonly testRunner: GenerationRequest['testRunner'];
  /** The target as the snapshot measured it, `null` when it lists none. */
  readonly file: FileCoverageDto | null;
}

/** What one call of the generator is made from. */
export interface RequestParts {
  readonly improvement: Improvement;
  readonly subject: GenerationSubject;
  /** The improvement and the number of the attempt. */
  readonly owner: string;
  readonly workingCopyPath: string;
  readonly settings: ImprovementSettings;
  readonly now: Instant;
}

type UncoveredCode = Pick<
  GenerationTarget,
  'uncoveredLines' | 'openBranchLines' | 'uncoveredFunctions'
>;

const NOTHING_LISTED: UncoveredCode = {
  uncoveredLines: [],
  openBranchLines: [],
  uncoveredFunctions: [],
};

function hintOf(mutant: Mutant): MutantHint {
  const { startLine, mutator, replacement } = mutant;
  return { line: startLine, mutator, replacement };
}

/**
 * Only a measured file lists what no test reaches. A file the snapshot
 * does not measure is still aimed at through the mutants no test detects:
 * `analyzing` let it through, and the gate judges what a patch did.
 */
function uncoveredOf(file: FileCoverageDto | null): UncoveredCode {
  if (file?.state !== 'measured') {
    return NOTHING_LISTED;
  }
  const { uncoveredLines, openBranchLines, uncoveredFunctions } = file;
  return { uncoveredLines, openBranchLines, uncoveredFunctions };
}

function targetOf(
  improvement: Improvement,
  file: FileCoverageDto | null,
): GenerationTarget {
  const mutation = improvement.verificationBaseline?.mutation ?? null;
  return {
    file: improvement.request.targetFile,
    ...uncoveredOf(file),
    undetectedMutants: (mutation?.undetected ?? []).map(hintOf),
  };
}

/** Why the gate rejected the last patch, or `null` before any rejection. */
function feedbackOf(improvement: Improvement): RejectionFeedback | null {
  const report = improvement.lastRejectedAttempt?.report ?? null;
  if (report === null) {
    return null;
  }
  return {
    reasons: report.reasons,
    survivingMutants: report.survivingMutants.map((mutant) => ({
      ...hintOf(mutant),
      reached: mutant.reached,
    })),
  };
}

/** The limits of the settings, and no more time than is left of the budget. */
function limitsOf(parts: RequestParts): GenerationLimits {
  const { maxTurns, maxCostUsd, timeoutMs } = parts.settings.generation;
  const leftMs =
    parts.improvement.workDeadline.epochMilliseconds -
    parts.now.epochMilliseconds;
  return {
    maxTurns,
    maxCostUsd,
    timeoutMs: Math.max(LEAST_TIMEOUT_MS, Math.min(timeoutMs, leftMs)),
  };
}

/** The request of one call of the generator in a lent working copy. */
export function generationRequestOf(parts: RequestParts): GenerationRequest {
  const { improvement, subject, settings } = parts;
  const { cli, model, promptVersion } = improvement.request.generator;
  return {
    workingCopyPath: parts.workingCopyPath,
    owner: parts.owner,
    target: targetOf(improvement, subject.file),
    testFileSuffixes: settings.testFileSuffixes,
    testRunner: subject.testRunner,
    feedback: feedbackOf(improvement),
    generator: { cli, model, promptVersion },
    limits: limitsOf(parts),
  };
}
