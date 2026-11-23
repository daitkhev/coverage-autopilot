import type { Improvement } from '@coverage-autopilot/api-contracts/improvements';
import type { ImprovementStatus } from '@coverage-autopilot/api-contracts/statuses';

import { isFinal } from '#tests/support/designed-moves';
import {
  rests,
  type Watched,
  watched,
  watchFindings,
} from '#tests/support/improvement-watch';
import { TARGET } from '#tests/support/mutation-reports';
import type { Storm } from '#tests/support/storm';
import { type Ended, requestedAgain } from '#tests/support/storm-again';
import {
  cancelFindings,
  type CancelLog,
  cancelOnLook,
  decidedAtOnce,
  decisionFindings,
} from '#tests/support/storm-decisions';
import { requestedAtOnce, type Winner } from '#tests/support/storm-requests';

/** A round of improvements, from the snapshot each repository got in it. */
export interface ImprovementRound {
  readonly number: number;
  readonly snapshots: ReadonlyMap<string, string>;
}

/** An improvement of a round, its cancels, and what broke on its way. */
interface Journey extends Ended {
  readonly findings: string[];
}

/** The ends the work allows: the target can be covered more, the other file cannot. */
function allowedEnds(winner: Winner): readonly ImprovementStatus[] {
  return winner.target.file === TARGET
    ? ['completed', 'cancelled']
    : ['skipped', 'cancelled'];
}

function endFindings(winner: Winner, last: Improvement): string[] {
  const findings: string[] = [];
  if (!allowedEnds(winner).includes(last.status)) {
    findings.push(
      `${winner.target.label} ended ${last.status}: ` +
        JSON.stringify(last.failure ?? last.skip),
    );
  }
  if (last.status === 'completed' && last.pullRequest === null) {
    findings.push(`${winner.target.label} completed with no pull request.`);
  }
  return findings;
}

/**
 * Watches an improvement until it rests, cancelling it at a status of
 * chance; an improvement that waits for a person then gets approvals and
 * now and then cancels at once, and is watched until it ends.
 */
async function journeyOf(storm: Storm, winner: Winner): Promise<Journey> {
  const log: CancelLog = { answers: [] };
  const first = await watched(storm, winner.id, {
    until: rests,
    onLook: cancelOnLook(storm, winner, log),
  });
  const findings = watchFindings(first);
  let last: Watched = first;
  if (first.last.status === 'awaiting_approval') {
    const decision = await decidedAtOnce(storm, winner, log);
    last = await watched(storm, winner.id, {
      until: (improvement) => isFinal(improvement.status),
    });
    findings.push(
      ...watchFindings(last),
      ...decisionFindings(winner, decision, last.last),
    );
  }
  findings.push(
    ...cancelFindings(winner, log, last.last),
    ...endFindings(winner, last.last),
  );
  return { winner, last: last.last, findings };
}

/** An improvement made by asking again runs to its end, as nobody cancels it. */
async function renewedFindings(
  storm: Storm,
  renewed: Winner,
): Promise<string[]> {
  const ended = await watched(storm, renewed.id, {
    until: (improvement) => isFinal(improvement.status),
  });
  const [expected] = allowedEnds(renewed);
  return [
    ...watchFindings(ended),
    ...(ended.last.status === expected
      ? endFindings(renewed, ended.last)
      : [`${renewed.target.label}, asked again, ended ${ended.last.status}.`]),
  ];
}

/**
 * A round of improvements: many requests at once for every file, cancels
 * at moments of chance while they run, approvals and cancels at once for
 * those that wait for a person, and the same work asked again once they
 * all ended. It gives every rule that broke on the way.
 */
export async function improvedAtOnce(
  storm: Storm,
  round: ImprovementRound,
): Promise<string[]> {
  const burst = await requestedAtOnce(storm, round);
  const journeys = await Promise.all(
    burst.winners.map(async (winner) => journeyOf(storm, winner)),
  );
  const again = await requestedAgain(storm, journeys, round.number);
  const renewed = await Promise.all(
    again.renewed.map(async (winner) => renewedFindings(storm, winner)),
  );
  return [
    ...burst.findings,
    ...journeys.flatMap(({ findings }) => findings),
    ...again.findings,
    ...renewed.flat(),
  ];
}
