import { CONTRACT_VERSION } from '@coverage-autopilot/api-contracts/health';

import type { ServiceReach } from '#api/service-reach';
import type { ReadyService, ServiceStep } from '#api/service-start';
import { countWords } from '#theme/counts';

/** How a try to reach the service ended without one: an answer, or a fault. */
export type NotReached =
  | Exclude<ServiceReach, ReadyService>
  | { readonly outcome: 'fault'; readonly fault: unknown };

/** What a person is told when no service could be reached. */
export interface ReachWords {
  readonly headline: string;
  /** The stable word for the outcome, for searching. */
  readonly code: string;
  /** What the service wrote, as it wrote it. */
  readonly said: readonly string[];
  readonly next: string;
}

/** What the client says while it is on its way to a service. */
export const STEP_WORDS: Readonly<Record<ServiceStep, string>> = {
  starting: 'Starting the service',
  stopping_the_old_one: 'Stopping the service of another version',
};

function faultWords(fault: unknown): string {
  return fault instanceof Error ? fault.message : String(fault);
}

/** The words for each way the service was not reached. */
export function reachWordsOf(problem: NotReached): ReachWords {
  switch (problem.outcome) {
    case 'did_not_start':
      return {
        headline: 'The service did not start.',
        code: problem.outcome,
        said: problem.lines,
        next: `The rest is in ${problem.log}.`,
      };
    case 'busy_with_another_version': {
      const { scans, improvements } = problem.activeWork;
      const work = [
        countWords(improvements, 'improvement'),
        countWords(scans, 'scan'),
      ].join(' and ');
      return {
        headline: `A service of another version runs ${work}, so it is left as it is.`,
        code: problem.outcome,
        said: [
          `It speaks contract ${String(problem.contractVersion)}, and this client speaks ${String(CONTRACT_VERSION)}.`,
        ],
        next: 'Wait until its work ends, then try again.',
      };
    }
    case 'fault':
      return {
        headline: 'The service could not be reached.',
        code: problem.outcome,
        said: [faultWords(problem.fault)],
        next: 'Check that the client and the service are of one version.',
      };
  }
}

/** The same words as lines, for a command to write to standard error. */
export function reachLinesOf(problem: NotReached): readonly string[] {
  const words = reachWordsOf(problem);
  return [words.headline, ...words.said, words.next];
}
