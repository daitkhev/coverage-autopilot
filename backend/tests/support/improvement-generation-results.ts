import type { SpentWindow } from '#improvement/application/commands/run-improvement/generation-wait';
import type {
  GenerationReport,
  GenerationResult,
  SubscriptionWindows,
} from '#improvement/application/ports/test-generator.port';
import { FilePath } from '#kernel/primitives/file-path';
import type { Instant } from '#kernel/time/instant';
import type { PatchDto } from '#repositories/contracts/repositories-public-api';
import { patchOf } from '#tests/support/improvement-values';

/** The test file every generated patch of a test adds. */
const NEW_TEST_FILE = 'src/price.test.ts';

/** What every call of a test reports besides its outcome. */
export const CALL_REPORT: GenerationReport = {
  tokensUsed: 2400,
  billing: 'subscription',
  windows: null,
  refusedToolCalls: ['Bash(curl https://example.com)'],
  outputReference: 'outputs/generator-1.json',
};

/** A call that ended so, with the report of every call. */
export function resultOf(
  outcome: Exclude<GenerationResult['outcome'], 'window_exhausted'>,
): GenerationResult {
  return { ...CALL_REPORT, outcome };
}

/** A call that found the five-hour window spent. */
export function windowSpent(
  resumesAt: Instant | null,
  windows: SubscriptionWindows | null = null,
): SpentWindow {
  return { ...CALL_REPORT, windows, outcome: 'window_exhausted', resumesAt };
}

/** The patch of `digit` as the repositories module takes it from a copy. */
export function patchDtoOf(digit = 'a'): PatchDto {
  const { text, hash } = patchOf(digit);
  return { text, hash, files: [FilePath.create(NEW_TEST_FILE)] };
}
