type CoverageMetric = 'statements' | 'branches' | 'functions' | 'lines';

const METRICS: readonly CoverageMetric[] = [
  'statements',
  'branches',
  'functions',
  'lines',
];

interface Counter {
  readonly covered: number;
  readonly total: number;
}

/** The four counters of the target file in one measurement. */
export type TargetCounters = Readonly<Record<CoverageMetric, Counter>>;

export interface CoverageComparison {
  readonly before: TargetCounters;
  readonly after: TargetCounters;
  /** The metric of the threshold of the snapshot the gate compares with. */
  readonly metric: CoverageMetric;
}

export type CoverageGain =
  | { readonly outcome: 'increased' }
  | { readonly outcome: 'unchanged' }
  | { readonly outcome: 'decreased'; readonly metric: CoverageMetric };

/**
 * Whether the target file is better covered after the patch: more of the
 * metric of the threshold is covered, and no counter covers less. New tests
 * that cover other code while some code stops running are not a gain.
 */
export function coverageGainOf(comparison: CoverageComparison): CoverageGain {
  const { before, after, metric } = comparison;
  const fallen = METRICS.find(
    (each) => after[each].covered < before[each].covered,
  );
  if (fallen !== undefined) {
    return { outcome: 'decreased', metric: fallen };
  }
  return after[metric].covered > before[metric].covered
    ? { outcome: 'increased' }
    : { outcome: 'unchanged' };
}
