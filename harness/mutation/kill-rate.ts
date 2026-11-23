import type { Mutant } from '#harness/mutation/report';

/** How the mutants of an area ended. */
export interface Counts {
  readonly killed: number;
  readonly survived: number;
  readonly noCoverage: number;
  readonly timeout: number;
}

const KILLED = 'Killed';
const SURVIVED = 'Survived';
const NO_COVERAGE = 'NoCoverage';
const TIMEOUT = 'Timeout';
const PERCENT = 100;

/** Statuses that count: a mutant was run, or should have been. */
const COUNTED = [KILLED, SURVIVED, NO_COVERAGE, TIMEOUT];
/**
 * Statuses that are left out, as the engine leaves them out: the mutant
 * does not compile, or it breaks the run before any test starts.
 */
const LEFT_OUT = ['CompileError', 'RuntimeError'];

/**
 * Statuses the verdict cannot be built on: a mutant with no final status,
 * one that was switched off, or a status this code does not know.
 */
export function unjudgedStatuses(mutants: readonly Mutant[]): string[] {
  const known = [...COUNTED, ...LEFT_OUT];
  const statuses = mutants.map((mutant) => mutant.status);
  return [...new Set(statuses)]
    .filter((status) => !known.includes(status))
    .sort();
}

export function countsOf(mutants: readonly Mutant[]): Counts {
  const count = (status: string): number =>
    mutants.filter((mutant) => mutant.status === status).length;
  return {
    killed: count(KILLED),
    survived: count(SURVIVED),
    noCoverage: count(NO_COVERAGE),
    timeout: count(TIMEOUT),
  };
}

/** The mutants a kill rate is taken over. A timeout is one of them. */
export function countedOf(counts: Counts): number {
  return counts.killed + counts.survived + counts.noCoverage + counts.timeout;
}

/**
 * Whether the kill rate is at or above a floor given in percent. It is
 * decided on whole numbers, so no rounding can move the answer.
 */
export function reaches(counts: Counts, floor: number): boolean {
  return counts.killed * PERCENT >= floor * countedOf(counts);
}

/** The kill rate in percent, as text with two decimals. */
export function formatRate(counts: Counts): string {
  const rate = (counts.killed * PERCENT) / countedOf(counts);
  const decimals = 2;
  return `${rate.toFixed(decimals)}%`;
}
