import type { FilePath } from '#kernel/primitives/file-path';
import type { Mutant } from '#verification/domain/value-objects/mutant.vo';
import type {
  MutantStatus,
  MutationBaseline,
  MutationTool,
} from '#verification/domain/value-objects/mutation-baseline.vo';

const PERCENT = 100;

/** A mutant of the run with the patch. */
export interface PatchedMutant {
  readonly mutant: Mutant;
  readonly status: MutantStatus;
  /** The files of the tests that run the mutant or kill it. */
  readonly testFiles: readonly FilePath[];
}

export interface PatchedMutationRun {
  readonly tool: MutationTool;
  readonly mutantSetHash: string;
  readonly mutants: readonly PatchedMutant[];
}

export interface MutationGainRequest {
  readonly baseline: MutationBaseline;
  readonly run: PatchedMutationRun;
  /** The files of the patch: the only tests that were not there before. */
  readonly newTestFiles: readonly FilePath[];
  /** The least kill rate, as a percentage. */
  readonly threshold: number;
  /** How many surviving mutants go back as feedback at most. */
  readonly survivorLimit: number;
}

/** What the new tests add, not the score a mutation tool prints. */
export interface MutantCounts {
  /** U: the mutants no existing test detects. */
  readonly undetectedBefore: number;
  /** ΔK: those of U the run with the patch kills. */
  readonly killed: number;
  /** Those of U a new test runs, timeouts left out. */
  readonly reached: number;
  readonly timedOut: number;
}

/** A mutant of U the new tests still do not detect, as a place to aim at. */
export interface SurvivingMutant {
  readonly mutant: Mutant;
  /** Whether a new test runs the code of the mutant at all. */
  readonly reached: boolean;
}

/**
 * `incomparable`: the two runs did not measure the same set of mutants
 * with the same tool, so the report is incomplete and rejects nothing.
 */
export type MutationGain =
  | { readonly outcome: 'incomparable'; readonly reason: string }
  | {
      readonly outcome: 'measured';
      readonly passed: boolean;
      readonly counts: MutantCounts;
      readonly surviving: readonly SurvivingMutant[];
    };

function incomparabilityOf(
  baseline: MutationBaseline,
  run: PatchedMutationRun,
): string | null {
  if (!baseline.isMeasuredBy(run.tool)) {
    const { name, version, testRunner } = run.tool;
    return `The mutation run with the patch used ${name} ${version} with ${testRunner}, not the tool of the baseline.`;
  }
  return run.mutantSetHash === baseline.mutantSetHash
    ? null
    : 'The mutation run with the patch found another set of mutants than the baseline.';
}

/** The mutants of U as the run with the patch found them, or null. */
function undetectedInRun(request: MutationGainRequest): PatchedMutant[] | null {
  const byKey = new Map(
    request.run.mutants.map((each) => [each.mutant.key, each]),
  );
  const found: PatchedMutant[] = [];
  for (const { mutant } of request.baseline.undetected) {
    const patched = byKey.get(mutant.key);
    if (patched === undefined) {
      return null;
    }
    found.push(patched);
  }
  return found;
}

function survivorsOf(
  patched: readonly PatchedMutant[],
  isReached: (mutant: PatchedMutant) => boolean,
): SurvivingMutant[] {
  const surviving = patched
    .filter(({ status }) => status === 'survived' || status === 'no_coverage')
    .map((each) => ({ mutant: each.mutant, reached: isReached(each) }));
  return [
    ...surviving.filter(({ reached }) => reached),
    ...surviving.filter(({ reached }) => !reached),
  ];
}

/**
 * The mutation check as the system design defines it: U are the mutants
 * no existing test detects, ΔK those of U the patch kills, and R is ΔK
 * over the mutants of U a new test runs, timeouts left out. The check
 * passes when ΔK is at least one and R reaches the threshold.
 */
export function mutationGainOf(request: MutationGainRequest): MutationGain {
  const reason = incomparabilityOf(request.baseline, request.run);
  const patched = undetectedInRun(request);
  if (reason !== null || patched === null) {
    return {
      outcome: 'incomparable',
      reason:
        reason ??
        'The mutation run with the patch lacks a mutant of the baseline.',
    };
  }
  const newFiles = new Set(request.newTestFiles.map(({ value }) => value));
  const isReached = (each: PatchedMutant): boolean =>
    each.testFiles.some(({ value }) => newFiles.has(value));
  const counts: MutantCounts = {
    undetectedBefore: patched.length,
    killed: patched.filter(({ status }) => status === 'killed').length,
    reached: patched.filter(
      (each) => each.status !== 'timeout' && isReached(each),
    ).length,
    timedOut: patched.filter(({ status }) => status === 'timeout').length,
  };
  return {
    outcome: 'measured',
    passed:
      counts.killed >= 1 &&
      counts.killed * PERCENT >= request.threshold * counts.reached,
    counts,
    surviving: survivorsOf(patched, isReached).slice(0, request.survivorLimit),
  };
}
