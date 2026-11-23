/**
 * Give a repository a whole percent of its own, or `null` to judge it by
 * the default of the service again.
 */
export interface ChangeThresholdCommand {
  readonly repositoryId: string;
  readonly percentage: number | null;
}
