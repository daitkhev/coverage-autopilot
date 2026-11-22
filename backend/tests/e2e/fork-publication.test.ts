import { readdirSync } from 'node:fs';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { Improvement } from '@coverage-autopilot/api-contracts/improvements';
import {
  type AccessCheck,
  accessCheckSchema,
} from '@coverage-autopilot/api-contracts/repositories';

import type { GhStandIn } from '#tests/support/gh-stand-in';
import {
  type StandInHost,
  standInHost,
} from '#tests/support/hosted-built-service';
import { journeyIn } from '#tests/support/journey-lines';
import { NEW_TESTS, TARGET } from '#tests/support/mutation-reports';
import { publishedBranches } from '#tests/support/published-branches';
import { type RepositoryWork, workOn } from '#tests/support/repository-work';
import { RestartedService } from '#tests/support/restarted-service';
import { type StoredWork, storedWorkOf } from '#tests/support/stored-work';
import { type StressStage, untilIdle } from '#tests/support/stress-run';
import { TemporaryCodeHost } from '#tests/support/temporary-code-host';
import { WIDGETS_FILES, WIDGETS_NAME } from '#tests/support/widgets-project';

/** The account of gh, which may not push to a repository of `acme`. */
const ACCOUNT = 'acme-bot';
const FORK = `${ACCOUNT}/widgets`;

/** Each call of gh takes this long, so the kill comes while one runs. */
const GH_PACE_MS = 2_000;

/** A new fork answers after a while, as on a host, so the service waits. */
const FORK_DELAY_MS = 3_000;

/**
 * A short lease, so the next start takes the job of the killed one soon
 * after it begins, and a heartbeat well within it.
 */
const SERVICE_VARIABLES = {
  AUTOPILOT_QUEUE_LEASE_MS: '1500',
  AUTOPILOT_QUEUE_HEARTBEAT_MS: '250',
  AUTOPILOT_LOG_LEVEL: 'info',
  CLAUDE_CODE_OAUTH_TOKEN: 'fictional-generator-credential-3319',
};

/** A start answers in a second, and in many on a loaded machine. */
const WAITS = { answer: { timeout: 60_000, interval: 100 }, endMs: 60_000 };

/**
 * A scan and an improvement take seconds alone, and every call of gh two
 * more here. A gate that runs other steps beside them makes all slower.
 */
const WORK_WAIT = { timeout: 180_000, interval: 50 };

/** The whole journey, with the kill, the start after it and the waits. */
const JOURNEY_TIMEOUT_MS = 300_000;

/** What the journey saw on its way, for the tests to judge. */
interface Journey {
  readonly work: RepositoryWork;
  readonly access: AccessCheck;
  readonly stored: StoredWork;
  /** What each start wrote to its log: the killed one, then the next. */
  readonly logs: readonly string[];
}

let standIns: StandInHost | undefined;
let service: RestartedService | undefined;
let journey: Journey;

function host(): TemporaryCodeHost {
  if (standIns === undefined) {
    throw new Error('The code host of the journey was never made.');
  }
  return standIns.host;
}

function improvementOfTarget(): Improvement {
  const found = journey.work.improvements.find(
    (improvement) => improvement.targetFile === TARGET,
  );
  if (found === undefined) {
    throw new Error(`No improvement of ${TARGET} was made.`);
  }
  return found;
}

/** How often gh was called with arguments that begin with `command`. */
function callsOf(gh: GhStandIn, ...command: string[]): number {
  return gh
    .calls()
    .filter((call) =>
      command.every((part, index) => call.arguments[index] === part),
    ).length;
}

/**
 * Kills the service once it asked gh to open the pull request, which
 * takes the pace of gh, and starts it again on the same instance.
 */
async function killedWhilePublishing(stage: StressStage): Promise<void> {
  await vi.waitFor(() => {
    expect(callsOf(stage.host.host.gh, 'pr', 'create')).toBeGreaterThan(0);
  }, WORK_WAIT);
  await stage.service.stop('SIGKILL');
  stage.service.start();
}

/**
 * Works on the repository as a client does, while the service is killed
 * as it publishes, and checks the access once the work ended. The service
 * is stopped cleanly at the end, so its database can be read.
 */
async function walked(stage: StressStage): Promise<Journey> {
  const client = { service: stage.service, wait: WORK_WAIT };
  const [work] = await Promise.all([
    workOn(client, { name: WIDGETS_NAME, cancelAfterMs: null }),
    killedWhilePublishing(stage),
  ]);
  const checked = await stage.service.send(
    `/repositories/${work.repositoryId}/access`,
  );
  await untilIdle(stage, WORK_WAIT);
  await stage.service.stop('SIGTERM');
  return {
    work,
    access: accessCheckSchema.parse(checked.body),
    stored: storedWorkOf(stage.service.paths.database),
    logs: stage.service.logs(),
  };
}

beforeAll(async () => {
  const made = standInHost();
  standIns = made;
  made.host.createRepository(WIDGETS_NAME, WIDGETS_FILES);
  made.host.gh.answer({
    canPush: false,
    login: ACCOUNT,
    forkDelayMs: FORK_DELAY_MS,
  });
  made.host.gh.answerAtPace(GH_PACE_MS);
  const restarted = new RestartedService(
    { ...made.variables, ...SERVICE_VARIABLES },
    WAITS,
  );
  service = restarted;
  restarted.start();
  journey = await walked({ host: made, service: restarted });
}, JOURNEY_TIMEOUT_MS);

afterAll(async () => {
  try {
    await service?.close();
  } finally {
    standIns?.remove();
  }
});

describe('the built service, for an account that may not push to the repository', () => {
  it('should say in the access check that a result goes to a fork', () => {
    expect(journey.access).toMatchObject({
      passed: true,
      destination: { route: 'fork', account: ACCOUNT },
    });
  });

  it('should complete the improvement with a pull request inside the fork', () => {
    const { id, baseCommit } = improvementOfTarget();
    const url = `${TemporaryCodeHost.urlOf(FORK)}/pull/1`;

    expect(improvementOfTarget()).toMatchObject({
      status: 'completed',
      failure: null,
      branch: `coverage-autopilot/${id}`,
      pullRequest: { number: 1, url },
    });
    expect(host().gh.pullRequests()).toEqual([
      expect.objectContaining({
        url,
        head: `coverage-autopilot/${id}`,
        base: `coverage-autopilot/base-${baseCommit}`,
      }),
    ]);
  });

  it('should push the base and one commit to the fork, and nothing upstream', () => {
    const { id, baseCommit } = improvementOfTarget();
    const branches = publishedBranches(
      host(),
      FORK,
      journey.stored.improvements,
    );

    expect(branches).toHaveLength(2);
    expect(branches).toEqual(
      expect.arrayContaining([
        {
          branch: `coverage-autopilot/base-${baseCommit}`,
          owned: false,
          commits: '0',
          changes: '',
        },
        {
          branch: `coverage-autopilot/${id}`,
          owned: true,
          commits: '1',
          changes: `A\t${NEW_TESTS}`,
        },
      ]),
    );
    expect(
      publishedBranches(host(), WIDGETS_NAME, journey.stored.improvements),
    ).toEqual([]);
  });

  describe('when the start that publishes is killed and the next takes over', () => {
    it('should publish again, asking for the same fork, and make nothing twice', () => {
      const { id } = improvementOfTarget();
      const [, next = ''] = journey.logs;
      const told = journeyIn(
        next,
        (fields) =>
          fields['subjectId'] === id || fields['improvementId'] === id,
      );

      expect(journey.logs).toHaveLength(2);
      expect(told).toContain('A step of an improvement started. publishing');
      expect(told).not.toContain(
        'A step of an improvement started. generating',
      );
      expect(callsOf(host().gh, 'api', '--method=POST')).toBe(2);
      expect(readdirSync(host().remoteOf(ACCOUNT))).toEqual(['widgets']);
    });
  });
});
