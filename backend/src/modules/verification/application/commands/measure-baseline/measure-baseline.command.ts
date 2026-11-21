import type { MeasureBaselineRequest } from '#verification/contracts/verification-public-api';

/**
 * Measure what a commit is like before any patch: whether it type-checks,
 * whether its tests pass, and which mutants of the target nothing detects.
 */
export type MeasureBaselineCommand = MeasureBaselineRequest;
