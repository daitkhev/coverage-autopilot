import { isInSomePlace } from '#harness/architecture/patterns';
import {
  countedOf,
  type Counts,
  countsOf,
  formatRate,
  reaches,
  unjudgedStatuses,
} from '#harness/mutation/kill-rate';
import type { MutationReport } from '#harness/mutation/report';
import type { Area } from '#harness/shared/mutation-policy';

/** What the report gives for one area. */
export type AreaResult =
  | { readonly kind: 'rate'; readonly counts: Counts }
  /** A complete run that found nothing to mutate. */
  | { readonly kind: 'not_applicable' }
  /** No rate at all: the report cannot be trusted for this area. */
  | { readonly kind: 'not_measured'; readonly reason: string };

export interface Verdict {
  readonly area: string;
  readonly passed: boolean;
  readonly detail: string;
}

export function isInArea(path: string, area: Area): boolean {
  return (
    isInSomePlace(path, area.places) && !isInSomePlace(path, area.excluded)
  );
}

/**
 * Reads the result of an area from a report. `scope` is every file of the
 * area that the engine had to look at.
 */
export function resultOf(
  area: Area,
  report: MutationReport,
  scope: readonly string[],
): AreaResult {
  const absent = scope.filter((path) => !report.files.includes(path));
  if (absent.length > 0) {
    const reason = `${String(absent.length)} file(s) of the area are not in the report, such as ${absent[0] ?? ''}.`;
    return { kind: 'not_measured', reason };
  }
  const mutants = report.mutants.filter((m) => isInArea(m.file, area));
  const unjudged = unjudgedStatuses(mutants);
  if (unjudged.length > 0) {
    const reason = `A mutant has the status ${unjudged.join(', ')}.`;
    return { kind: 'not_measured', reason };
  }
  const counts = countsOf(mutants);
  return countedOf(counts) === 0
    ? { kind: 'not_applicable' }
    : { kind: 'rate', counts };
}

function describe(counts: Counts): string {
  return (
    `${formatRate(counts)}: ${String(counts.killed)} killed, ` +
    `${String(counts.survived)} survived, ` +
    `${String(counts.noCoverage)} not covered, ` +
    `${String(counts.timeout)} timed out`
  );
}

function rateVerdict(counts: Counts, floor: number | undefined): string {
  if (floor === undefined) {
    return 'has no floor. A floor must be decided';
  }
  const side = reaches(counts, floor) ? 'at or above' : 'below';
  return `${side} the floor of ${String(floor)}%`;
}

/**
 * Judges an area by its floor. A floor is a decision of the owner: a rate
 * with no floor fails, and so does an area with a floor and no mutant.
 */
export function verdictOf(
  area: string,
  result: AreaResult,
  floor: number | undefined,
): Verdict {
  if (result.kind === 'not_measured') {
    return { area, passed: false, detail: `not measured. ${result.reason}` };
  }
  if (result.kind === 'not_applicable') {
    return floor === undefined
      ? { area, passed: true, detail: 'not_applicable: nothing to mutate' }
      : {
          area,
          passed: false,
          detail: 'not_applicable, and it has a floor: mutants were expected',
        };
  }
  const { counts } = result;
  return {
    area,
    passed: floor !== undefined && reaches(counts, floor),
    detail: `${describe(counts)}, ${rateVerdict(counts, floor)}`,
  };
}
