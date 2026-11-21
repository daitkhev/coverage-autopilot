import type {
  CoverageCounters,
  CoverageMetric,
} from '#coverage/domain/value-objects/coverage-counters.vo';
import { CoveragePercentage } from '#coverage/domain/value-objects/coverage-percentage.vo';
import { ValueObject } from '#kernel/primitives/value-object';

/** Lines, because they match what people expect to read. */
const DEFAULT_METRIC: CoverageMetric = 'lines';
const DEFAULT_PERCENTAGE = 80;

interface CoverageThresholdProps {
  readonly metric: CoverageMetric;
  readonly percentage: CoveragePercentage;
}

/** A metric and a percentage. A measured file below it needs improvement. */
export class CoverageThreshold extends ValueObject<CoverageThresholdProps> {
  private constructor(props: CoverageThresholdProps) {
    super(props);
  }

  public static create(props: {
    readonly metric: CoverageMetric;
    readonly percentage: number;
  }): CoverageThreshold {
    return new CoverageThreshold({
      metric: props.metric,
      percentage: CoveragePercentage.create(props.percentage),
    });
  }

  /** 80% of lines, unless the settings say otherwise. */
  public static byDefault(): CoverageThreshold {
    return CoverageThreshold.create({
      metric: DEFAULT_METRIC,
      percentage: DEFAULT_PERCENTAGE,
    });
  }

  public get metric(): CoverageMetric {
    return this.props.metric;
  }

  public get percentage(): CoveragePercentage {
    return this.props.percentage;
  }

  /** Counters with nothing of the metric to count are never below it. */
  public isAbove(counters: CoverageCounters): boolean {
    return counters.of(this.metric).isBelow(this.percentage);
  }
}
