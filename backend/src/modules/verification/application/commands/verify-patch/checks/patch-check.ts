import type { PatchedCopy } from '#verification/application/commands/verify-patch/patched-copy';
import type {
  CheckName,
  CheckResult,
} from '#verification/domain/value-objects/check-result.vo';

/** One of the checks that run in a patched copy, the second to the seventh. */
export interface PatchCheck {
  readonly name: CheckName;
  /**
   * Why the check has nothing to examine, read from the baseline and from
   * the checks before it, or `null` when it has something.
   */
  inapplicability(copy: PatchedCopy): string | null;
  /** The result, without the time the check took. */
  run(copy: PatchedCopy, signal: AbortSignal): Promise<CheckResult>;
}
