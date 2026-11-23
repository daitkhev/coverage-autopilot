import type {
  CoverageCounters,
  CoverageMetric,
} from '#coverage/domain/value-objects/coverage-counters.vo';
import { CoveragePercentage } from '#coverage/domain/value-objects/coverage-percentage.vo';
import { ValueObject } from '#kernel/primitives/value-object';

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
