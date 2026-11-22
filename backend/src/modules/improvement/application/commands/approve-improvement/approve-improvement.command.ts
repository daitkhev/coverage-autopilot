/**
 * A person approves publishing the patch they saw. The hash names that
 * patch, so an approval of another one is refused.
 */
export interface ApproveImprovementCommand {
  readonly improvementId: string;
  readonly patchHash: string;
}
