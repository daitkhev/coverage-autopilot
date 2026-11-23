import type { ImprovementPatchDto } from '#improvement/application/dto/improvement.dto';

/** The patch a person reviews before approving it, in review mode. */
export interface GetImprovementPatchQuery {
  readonly improvementId: string;
}

/**
 * `found`: the patch of the accepted attempt. `no_accepted_patch`: the
 * gate has accepted none yet, or never will.
 */
export type ImprovementPatchResult =
  | { readonly outcome: 'found'; readonly patch: ImprovementPatchDto }
  | { readonly outcome: 'no_accepted_patch' };
