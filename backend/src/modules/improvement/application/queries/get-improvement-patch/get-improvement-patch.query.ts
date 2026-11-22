/** The patch a person reviews before approving it, in review mode. */
export interface GetImprovementPatchQuery {
  readonly improvementId: string;
}

/**
 * `found`: the patch of the accepted attempt, named by its hash, which an
 * approval repeats. `no_accepted_patch`: the gate has accepted none yet,
 * or never will.
 */
export type ImprovementPatchResult =
  | {
      readonly outcome: 'found';
      readonly improvementId: string;
      readonly attemptNumber: number;
      readonly patch: string;
      readonly patchHash: string;
    }
  | { readonly outcome: 'no_accepted_patch' };
