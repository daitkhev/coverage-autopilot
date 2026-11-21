import { CoverageCounter } from '#coverage/domain/value-objects/coverage-counter.vo';
import { ValueObject } from '#kernel/primitives/value-object';

/** The four counts an Istanbul report keeps for a file. */
export type CoverageMetric = 'statements' | 'branches' | 'functions' | 'lines';

type CoverageCountersProps = Readonly<Record<CoverageMetric, CoverageCounter>>;

const METRICS: readonly CoverageMetric[] = [
  'statements',
  'branches',
  'functions',
  'lines',
];

const NOTHING = CoverageCounter.create({ covered: 0, total: 0 });

/** The statements, branches, functions and lines of one file or of many. */
export class CoverageCounters extends ValueObject<CoverageCountersProps> {
  private constructor(props: CoverageCountersProps) {
    super(props);
  }

  public static create(props: CoverageCountersProps): CoverageCounters {
    return new CoverageCounters(props);
  }

  /** Every count at zero of zero. */
  public static none(): CoverageCounters {
    return new CoverageCounters({
      statements: NOTHING,
      branches: NOTHING,
      functions: NOTHING,
      lines: NOTHING,
    });
  }

  public of(metric: CoverageMetric): CoverageCounter {
    return this.props[metric];
  }

  /** A row of zero of zero, which proves nothing about a file. */
  public isEmpty(): boolean {
    return METRICS.every((metric) => this.of(metric).isEmpty());
  }

  public plus(other: CoverageCounters): CoverageCounters {
    return new CoverageCounters({
      statements: this.of('statements').plus(other.of('statements')),
      branches: this.of('branches').plus(other.of('branches')),
      functions: this.of('functions').plus(other.of('functions')),
      lines: this.of('lines').plus(other.of('lines')),
    });
  }
}
