import type {
  ImprovementFailureReason,
  ImprovementStatus,
  SkipReason,
} from '@coverage-autopilot/api-contracts/statuses';

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
    next: 'Larger limits give the generator more room to try.',
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
  existing_tests_fail: {
    headline: 'The tests of the repository fail in the sandbox',
    next: 'Let them fail with AUTOPILOT_BASELINE_TESTS=may_fail, or fix them.',
  },
  mutation_unsupported: {
    headline: 'Mutants cannot be measured in this project',
    next: 'Check that the mutation tool runs with the tests of this project.',
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
    next: 'Check the access to the repository, then start it again.',
  },
};

/** Why the work was not needed, as a headline. */
export const SKIP_WORDS: Readonly<Record<SkipReason, string>> = {
  threshold_met: 'The file is already above the threshold',
  no_undetected_mutants: 'The tests already detect every mutant',
};
