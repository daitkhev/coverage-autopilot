import type { ImprovementDto } from '#improvement/application/dto/improvement.dto';

/**
 * A person approves publishing the patch they saw. The hash names that
 * patch, so an approval of another one is refused.
 */
export interface ApproveImprovementCommand {
  readonly improvementId: string;
  readonly patchHash: string;
}

/**
 * Why an approval changed nothing: the hash names another patch than the
 * accepted one, or the improvement does not wait for an approval.
 */
export interface ApprovalRefusal {
  readonly outcome: 'refused';
  readonly reason: 'patch_hash_mismatch' | 'status_conflict';
  readonly message: string;
}

/** `approved`: the patch is published next, by a job of its own. */
export type ApproveImprovementResult =
  | { readonly outcome: 'approved'; readonly improvement: ImprovementDto }
  | ApprovalRefusal;
