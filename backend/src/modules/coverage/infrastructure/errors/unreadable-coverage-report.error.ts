import { InfrastructureError } from '#kernel/errors/infrastructure.error';

/**
 * A runner wrote a report that is not the JSON of Istanbul. Running the
 * same tools again writes the same report, so it is not retried.
 */
export class UnreadableCoverageReportError extends InfrastructureError {
  public readonly code = 'unreadable_coverage_report';
  public readonly retryable = false;
}
