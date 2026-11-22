import type { PrepareProjectResult } from '#coverage/application/contracts/coverage-public-api';
import type {
  BaselineTests,
  BaselineTestsReading,
} from '#verification/application/commands/measure-baseline/baseline-tests';
import type { MeasureBaselineResult } from '#verification/application/contracts/verification-public-api';

/** A step either gives its value or ends the whole measurement. */
export type Step<Value> =
  | { readonly outcome: 'done'; readonly value: Value }
  | { readonly outcome: 'stopped'; readonly result: MeasureBaselineResult };

export const TIMED_OUT: Step<never> = {
  outcome: 'stopped',
  result: { outcome: 'timed_out' },
};

export function done<Value>(value: Value): Step<Value> {
  return { outcome: 'done', value };
}

export function stopped(result: MeasureBaselineResult): Step<never> {
  return { outcome: 'stopped', result };
}

export function unsupportedProject(detail: string): Step<never> {
  return stopped({
    outcome: 'unsupported',
    reason: 'project_unsupported',
    detail,
    outputReference: null,
  });
}

/** Tests that fail and may not, or that no report names, stop here. */
export function testsStepOf(
  reading: BaselineTestsReading,
): Step<BaselineTests> {
  return reading.outcome === 'read'
    ? done(reading.tests)
    : stopped({
        outcome: 'unsupported',
        reason: 'existing_tests_fail',
        detail: reading.detail,
        outputReference: reading.outputReference,
      });
}

/** A project that cannot be prepared ends the measurement, saying why. */
export function refusalOf(
  preparation: Exclude<PrepareProjectResult, { outcome: 'ready' }>,
): Step<never> {
  if (preparation.outcome === 'unsupported') {
    return unsupportedProject(preparation.detail);
  }
  const { exitCode, outputReference } = preparation;
  return stopped({
    outcome: 'unsupported',
    reason: 'install_failed',
    detail:
      exitCode === null
        ? 'The install of the packages ran out of time.'
        : `The install of the packages ended with exit code ${String(exitCode)}.`,
    outputReference,
  });
}
