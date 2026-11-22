import type { ReactNode } from 'react';

import type {
  CheckName,
  StepStatus,
} from '@coverage-autopilot/api-contracts/statuses';

import { Timeline, type TimelineStep } from '#components/timeline';
import { CHECK_STATUS } from '#theme/status';

/** One check of the gate: its code, where it is, and what it took. */
export interface GateCheck {
  /** The name of a check, or the free code of a step that runs. */
  readonly name: string;
  readonly status: StepStatus;
  /** Its time, or "run 2 of 3" while it repeats. */
  readonly time?: string;
}

/** The seven checks in plain words, in the order they run. */
const CHECK_WORDS: Readonly<Record<CheckName, string>> = {
  test_files_only: 'only test files changed',
  type_check: 'project type-checks',
  new_tests_pass: 'new tests pass',
  existing_tests_pass: 'earlier tests still pass',
  repeated_runs: 'new tests pass on repeated runs',
  coverage_increase: 'coverage of the file went up',
  mutation_gain: 'mutants detected',
};

const WORDS: ReadonlyMap<string, string> = new Map(Object.entries(CHECK_WORDS));

/** A check that will run again or not at all says so beside its name. */
const SAID: ReadonlySet<StepStatus> = new Set([
  'error',
  'skipped',
  'not_applicable',
]);

/**
 * A check in plain words. A step code is free text, so a code that names
 * no check is shown as it is, with spaces for its underscores.
 */
export function checkWordsOf(code: string): string {
  return WORDS.get(code) ?? code.replaceAll('_', ' ');
}

function stepOf(check: GateCheck): TimelineStep {
  const look = CHECK_STATUS[check.status];
  return {
    id: check.name,
    look,
    title: checkWordsOf(check.name),
    done: check.status !== 'pending',
    ...(SAID.has(check.status) ? { note: look.word } : {}),
    ...(check.time === undefined ? {} : { time: check.time }),
  };
}

/**
 * The checks of the gate, each with its symbol, its words and its time.
 * Only the check that runs is bold.
 */
export function GateChecks({
  checks,
}: {
  readonly checks: readonly GateCheck[];
}): ReactNode {
  return <Timeline steps={checks.map(stepOf)} variant="checks" />;
}
