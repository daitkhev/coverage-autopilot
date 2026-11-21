import { InfrastructureError } from '#kernel/errors/infrastructure.error';

/**
 * StrykerJS left a report the service cannot read or trust: a link or a
 * file too large in its place, text that is not a mutation report, or a
 * final report that still holds a mutant it never ran. Running the same
 * tools again writes the same report, so it is not retried.
 */
export class UnreadableMutationReportError extends InfrastructureError {
  public readonly code = 'unreadable_mutation_report';
  public readonly retryable = false;
}
