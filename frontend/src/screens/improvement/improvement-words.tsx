import type {
  GenerationOutcome,
  GeneratorCli,
  ImprovementFailureReason,
  ImprovementStatus,
  SkipReason,
  WaitingFor,
} from '@coverage-autopilot/api-contracts/statuses';

import type { StatusLook } from '#theme/status';

/**
 * What the service does in each status, said on the last line of the
 * history. An improvement that ended does nothing, so it says how it ended.
 */
export const DOING: Readonly<Record<ImprovementStatus, string>> = {
  created: 'Waiting for its turn',
  analyzing: 'Measuring the file before any test is written',
  generating: 'Writing a test',
  waiting_for_limit: 'Waiting for the limit of the generator',
  verifying: 'Checking the patch',
  awaiting_approval: 'Waiting for your approval',
  publishing: 'Opening the pull request',
  completed: 'Done',
  failed: 'Stopped',
  cancelled: 'Cancelled',
  skipped: 'Skipped',
};

/** Who the improvement waits for, after "Waiting for". */
export const WAITING_FOR: Readonly<Record<WaitingFor, string>> = {
  approval: 'your approval',
  worker: 'a free worker',
  repository: 'the earlier work of its repository',
  limit: 'the limit of the generator to open again',
};

/** A failure as a sentence first, with what to do after it. */
interface FailureWords {
  readonly headline: string;
  readonly next: string;
}

/** Each reason of a failure as a headline, and the step that follows. */
export const FAILURE_WORDS: Readonly<
  Record<ImprovementFailureReason, FailureWords>
> = {
  budget_exhausted: {
    headline: 'The budget ran out',
    next: 'Start it again from the files with larger limits.',
  },
  stale_snapshot: {
    headline: 'The file changed since the scan',
    next: 'Scan the repository again, then start it again.',
  },
  verification_error: {
    headline: 'The checks could not run',
    next: 'Open the raw output to see why, then start it again.',
  },
  retries_exhausted: {
    headline: 'The work failed too many times',
    next: 'Open the raw output to see why, then start it again.',
  },
  mutation_unsupported: {
    headline: 'Mutants cannot be measured in this project',
    next: 'Start it again without the mutation check.',
  },
  quota_exhausted: {
    headline: 'The quota of the generator ran out',
    next: 'Wait for the quota to open again, then start it again.',
  },
  credential_exposed: {
    headline: 'The generator showed a credential',
    next: 'Replace the credential, then start it again.',
  },
  generator_unavailable: {
    headline: 'The generator cannot start',
    next: 'Check the generator: coverage-autopilot doctor.',
  },
  publish_failed: {
    headline: 'The pull request could not be opened',
    next: 'Check the access to the repository, then approve the patch again.',
  },
};

/** Why the work was not needed, as a headline. */
export const SKIP_WORDS: Readonly<Record<SkipReason, string>> = {
  threshold_met: 'The file is already above the threshold',
  no_undetected_mutants: 'The tests already detect every mutant',
};

/** Why an attempt ended without a verdict of the gate. */
export const OUTCOME_WORDS: Readonly<Record<GenerationOutcome, string>> = {
  generated: 'stopped before the checks ended',
  no_changes: 'the generator changed nothing',
  limit_reached: 'a limit ran out while it wrote',
  window_exhausted: 'the window of the subscription ran out',
  quota_exhausted: 'the quota of the generator ran out',
  credential_exposed: 'its output showed a credential and was thrown away',
};

/** An attempt that stopped before a test was written. */
export const NOT_WRITTEN = 'stopped before a test was written';

/** The name of the generator as people know it. */
export const GENERATOR_WORDS: Readonly<Record<GeneratorCli, string>> = {
  claude_code: 'Claude Code',
};

/** An attempt that ended with no verdict: it was stopped, not judged. */
export const NO_VERDICT: StatusLook = {
  glyph: 'skipped',
  word: 'no verdict',
  role: 'secondary',
};

/** The cells of a short commit or hash, as git prints it. */
export const SHORT_HASH = 7;
