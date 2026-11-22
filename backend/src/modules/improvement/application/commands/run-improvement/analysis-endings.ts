import type {
  CaptureSnapshotResult,
  FileCoverageDto,
} from '#coverage/contracts/coverage-public-api';
import { verificationBaselineOf } from '#improvement/application/commands/run-improvement/analysis-baseline';
import {
  budgetExhausted,
  type Change,
  failedWith,
} from '#improvement/application/commands/run-improvement/run-failures';
import type { Improvement } from '#improvement/domain/entities/improvement.entity';
import type { ImprovementRequest } from '#improvement/domain/value-objects/improvement-request.vo';
import {
  ImprovementSkip,
  type SkipReason,
} from '#improvement/domain/value-objects/improvement-skip.vo';
import type { FilePath } from '#kernel/primitives/file-path';
import type { RevisionAssessmentDto } from '#repositories/contracts/repositories-public-api';
import type {
  MeasureBaselineResult,
  VerificationBaselineDto,
} from '#verification/contracts/verification-public-api';

type CaptureRefusal = Exclude<
  CaptureSnapshotResult,
  { readonly outcome: 'captured' }
>;

function skippedWith(reason: SkipReason, message: string): Change {
  const skip = ImprovementSkip.create({ reason, message });
  return (improvement, at) => {
    improvement.skipWith(skip, at);
  };
}

function outputOf(reference: string | null): string {
  return reference === null
    ? 'and no output was kept.'
    : `with its output in ${reference}.`;
}

/**
 * A test for a file that changed since would be made for code that is
 * gone, so no token is spent on it. `null` goes on.
 */
export function revisionEnding(
  assessment: RevisionAssessmentDto,
  request: ImprovementRequest,
): Change | null {
  const base = request.baseCommit.value;
  const head = assessment.headCommit.value;
  switch (assessment.outcome) {
    case 'stale':
      return failedWith(
        'stale_snapshot',
        `${request.targetFile.value} changed on the default branch between ` +
          `${base} and its head ${head}.`,
      );
    case 'diverged':
      return failedWith(
        'stale_snapshot',
        `${base} is no longer an ancestor of the head ${head} of the ` +
          'default branch.',
      );
    default:
      return null;
  }
}

/** Without a fresh snapshot the gate has nothing to compare a patch with. */
export function captureEnding(capture: CaptureRefusal): Change {
  const detail =
    capture.outcome === 'unsupported'
      ? `for the reason ${capture.reason}: ${capture.detail}`
      : outputOf(capture.outputReference);
  return failedWith(
    'verification_error',
    `The fresh snapshot ended in ${capture.outcome}, ${detail}`,
  );
}

/**
 * Only a measured file below the threshold is a target: an unmeasured one
 * has no numbers a patch could raise. `null` goes on.
 */
export function targetEnding(
  file: FileCoverageDto | null,
  path: FilePath,
): Change | null {
  const name = path.value;
  if (file === null) {
    return failedWith(
      'verification_error',
      `The fresh snapshot does not list ${name}.`,
    );
  }
  switch (file.state) {
    case 'no_executable_code':
      return failedWith(
        'verification_error',
        `The fresh snapshot finds no code that runs in ${name}.`,
      );
    case 'unmeasured':
      return failedWith(
        'verification_error',
        `The fresh snapshot could not measure ${name}: ${file.reason}.`,
      );
    case 'measured':
      return file.belowThreshold
        ? null
        : skippedWith(
            'threshold_met',
            `The fresh snapshot measures ${name} at or above the ` +
              'threshold, so there is nothing to improve.',
          );
  }
}

/**
 * The mutation check passes only when a new test detects a mutant that
 * no test detected before, so with none left it could never pass.
 */
function measuredEnding(
  dto: VerificationBaselineDto,
  improvement: Improvement,
): Change {
  const { requiredChecks } = improvement.request.policy;
  const undetected = dto.mutation?.undetected.length ?? 0;
  if (requiredChecks.includes('mutation_gain') && undetected === 0) {
    return skippedWith(
      'no_undetected_mutants',
      `The existing tests detect every mutant of ${dto.targetFile.value}, ` +
        'so the mutation check could never pass.',
    );
  }
  const baseline = verificationBaselineOf(dto);
  return (next, at) => {
    next.recordVerificationBaseline(baseline, at);
    next.startGenerating(at);
  };
}

/** How the measure of the gate ends the analysis. */
export function measureEnding(
  result: MeasureBaselineResult,
  improvement: Improvement,
): Change {
  switch (result.outcome) {
    case 'measured':
      return measuredEnding(result.baseline, improvement);
    case 'unsupported':
      return failedWith(
        result.reason === 'mutation_unsupported'
          ? 'mutation_unsupported'
          : 'verification_error',
        `The gate cannot measure the commit, for the reason ` +
          `${result.reason}: ${result.detail}`,
      );
    case 'timed_out':
      return budgetExhausted(improvement);
  }
}
