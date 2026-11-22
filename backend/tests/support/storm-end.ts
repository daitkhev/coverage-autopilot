import { healthSchema } from '@coverage-autopilot/api-contracts/health';
import {
  type Improvement,
  improvementListSchema,
} from '@coverage-autopilot/api-contracts/improvements';

import { isFinal } from '#tests/support/designed-moves';
import { journeyIn } from '#tests/support/journey-lines';
import { send, type Storm } from '#tests/support/storm';

/** The line of the log that says a publishing step began. */
const PUBLISHING_BEGAN = 'A step of an improvement started. publishing';

/** What the end of a run found of its improvements and their pull requests. */
export interface Publications {
  readonly findings: string[];
  readonly improvements: readonly Improvement[];
  /** Pull requests of improvements a cancel reached while they published. */
  readonly cancelledWhilePublishing: number;
}

/** A step of the improvement began to publish, as the log of the service says. */
function beganToPublish(log: string, id: string): boolean {
  return journeyIn(log, (fields) => fields['improvementId'] === id).includes(
    PUBLISHING_BEGAN,
  );
}

/** A completed improvement names the one pull request of its branch. */
function completedFindings(
  completed: Improvement,
  pulls: ReturnType<Storm['hosted']['host']['gh']['pullRequests']>,
): string[] {
  const own = pulls.filter((pull) => pull.head === completed.branch);
  const [pull] = own;
  const recorded = completed.pullRequest;
  return own.length === 1 &&
    pull?.number === recorded?.number &&
    pull?.url === recorded?.url
    ? []
    : [
        `The improvement ${completed.id} names ${JSON.stringify(recorded)}, ` +
          `and the host holds ${JSON.stringify(own)} for its branch.`,
      ];
}

/**
 * A pull request the host holds belongs to a completed improvement, or
 * to one a cancel reached while it published: the design leaves a push
 * that began where it is, and only the database is held by the lease.
 */
function strayFindings(
  storm: Storm,
  improvements: readonly Improvement[],
): { findings: string[]; late: number } {
  const log = storm.hosted.service.log();
  const findings: string[] = [];
  let late = 0;
  for (const pull of storm.hosted.host.gh.pullRequests()) {
    const owner = improvements.find((one) => one.branch === pull.head);
    if (owner?.status === 'completed') {
      continue;
    }
    if (owner?.status === 'cancelled' && beganToPublish(log, owner.id)) {
      late += 1;
    } else {
      findings.push(
        `The host holds ${pull.url} for ${pull.head}, whose improvement ` +
          `is ${String(owner?.status)}.`,
      );
    }
  }
  return { findings, late };
}

/**
 * Every improvement the run made ended, and the pull requests on the host
 * are those of the improvements that completed, one each.
 */
export async function publications(storm: Storm): Promise<Publications> {
  const answer = await send(storm, '/improvements');
  const improvements = improvementListSchema.parse(answer.body).items;
  const pulls = storm.hosted.host.gh.pullRequests();
  const listed = new Set(improvements.map(({ id }) => id));
  const findings = [
    ...storm.known.improvements
      .filter((id) => !listed.has(id))
      .map((id) => `The list leaves out the improvement ${id}.`),
    ...improvements
      .filter(({ status }) => !isFinal(status))
      .map(({ id, status }) => `The improvement ${id} is still ${status}.`),
    ...improvements
      .filter(({ status }) => status === 'completed')
      .flatMap((completed) => completedFindings(completed, pulls)),
    ...improvements
      .filter(
        ({ status, pullRequest }) =>
          status !== 'completed' && pullRequest !== null,
      )
      .map(
        ({ id, status }) =>
          `The improvement ${id} is ${status} with a pull request.`,
      ),
  ];
  const stray = strayFindings(storm, improvements);
  return {
    findings: [...findings, ...stray.findings],
    improvements,
    cancelledWhilePublishing: stray.late,
  };
}

/** A service whose work all ended is ready and runs nothing. */
export async function idleFindings(storm: Storm): Promise<string[]> {
  const health = healthSchema.parse((await send(storm, '/health')).body);
  const { activeWork } = health;
  return health.ready && activeWork.scans === 0 && activeWork.improvements === 0
    ? []
    : [`The service is not idle: ${JSON.stringify(health)}.`];
}
