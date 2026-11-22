import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  type StandInHost,
  standInHost,
} from '#tests/support/hosted-built-service';
import {
  jobsEndedTwice,
  jobsLeftRunning,
  unexplainedLines,
} from '#tests/support/job-lines';
import { NEW_TESTS, TARGET } from '#tests/support/mutation-reports';
import { cancelAnswers, wrongRepeat } from '#tests/support/repository-work';
import { RestartedService } from '#tests/support/restarted-service';
import { drawnSeed } from '#tests/support/seeded-random';
import { jobKeyed, outcomeOf } from '#tests/support/stored-work';
import {
  type StressRun,
  stressRun,
  type StressSettings,
} from '#tests/support/stress-run';
import { COVERED } from '#tests/support/widgets-project';

/**
 * Drawn anew for each run. A run is played with the same choices again by
 * writing the seed its failure names here in place of the draw.
 */
const SEED = drawnSeed();

/** Named in every failure, so the run can be made again. */
const TOLD = `seed ${String(SEED)}`;

/**
 * A kill counts a run of every job it cuts short. Enough runs that most
 * jobs outlive the kills, and few enough that some may be spent.
 */
const MAX_RUNS = 6;

/**
 * Eight repositories, and jobs of three of them at once. Each command in
 * a container, and each call of `gh`, takes a tenth of a second, so a kill
 * often comes while one runs: a container it leaves running the next start
 * removes, and a pull request it leaves opening the next start finds.
 * Sixteen stops come while the jobs run, four of them clean, and a last
 * clean one once all the work ended. A person cancels three improvements
 * at a moment of their own.
 */
const SETTINGS: StressSettings = {
  seed: SEED,
  repositories: 8,
  commandMs: 100,
  plan: { stops: 16, ends: 4, killWithinMs: 5_000, endWithinMs: 3_000 },
  cancels: { count: 3, withinMs: 8_000 },
  workWait: { timeout: 240_000, interval: 250 },
};

/**
 * A short lease, so the jobs of a killed start are taken again soon after
 * the next start, and a heartbeat well within it.
 */
const SERVICE_VARIABLES = {
  AUTOPILOT_QUEUE_LEASE_MS: '1500',
  AUTOPILOT_QUEUE_HEARTBEAT_MS: '250',
  AUTOPILOT_QUEUE_MAX_RUNS: String(MAX_RUNS),
  AUTOPILOT_QUEUE_CONCURRENCY: '3',
  AUTOPILOT_LOG_LEVEL: 'info',
  CLAUDE_CODE_OAUTH_TOKEN: 'fictional-generator-credential-2207',
};

/** A start answers in a second, and in many on a loaded machine. */
const WAITS = { answer: { timeout: 60_000, interval: 100 }, endMs: 60_000 };

const RUN_TIMEOUT_MS = 290_000;

/** A widgets project has two sources, and each is measured. */
const MEASURED_FILES = 2;

const FINAL_JOBS: ReadonlySet<string> = new Set([
  'completed',
  'dead',
  'cancelled',
]);

/**
 * How an improvement of each file ends, as its status, its failure, the
 * status of its job and the outcome the job kept: the target gets its
 * test, and the file its tests cover whole has nothing to improve.
 */
const ASKED_ENDINGS: Readonly<Record<string, string>> = {
  [TARGET]: 'completed  completed completed',
  [COVERED]: 'skipped  completed skipped',
};

/**
 * How an improvement ends whose job the stops cut short until its runs
 * were spent: the job is dead and kept no outcome.
 */
const SPENT = 'failed retries_exhausted dead ';

/** How an improvement ends that a cancel reached before its end. */
const CANCELLED = 'cancelled  cancelled ';

/** The status of the job of an improvement that ended so. */
const JOB_AT_END: Readonly<Record<string, string>> = {
  completed: 'completed',
  skipped: 'completed',
  failed: 'dead',
  cancelled: 'cancelled',
};

/**
 * How a scan ends, as the status of its job and the outcome it kept: it
 * measured the repository, or the stops spent its runs.
 */
const SCAN_ENDINGS: ReadonlySet<string> = new Set([
  'completed captured',
  'dead ',
]);

/** What a clean stop leaves: nothing. */
const NOTHING_LEFT = { copies: [], containers: [], socket: false };

let standIns: StandInHost | undefined;
let service: RestartedService | undefined;
let run: StressRun;

function cleanStops(): StressRun['stops'] {
  return run.stops.filter(({ signal }) => signal === 'SIGTERM');
}

beforeAll(async () => {
  const host = standInHost();
  standIns = host;
  service = new RestartedService(
    { ...host.variables, ...SERVICE_VARIABLES },
    WAITS,
  );
  try {
    run = await stressRun({ host, service }, SETTINGS);
  } catch (error) {
    throw new Error(`The run with ${TOLD} did not end: ${String(error)}`, {
      cause: error,
    });
  }
}, RUN_TIMEOUT_MS);

afterAll(async () => {
  try {
    await service?.close();
  } finally {
    // A container a kill left is a file of the host, and the process that
    // plays it ends once the file is gone.
    standIns?.remove();
  }
});

describe(`the built service, stopped at random as it works (${TOLD})`, () => {
  it('should bring every job it was asked for to one final state, once', () => {
    const { jobs } = run.stored;
    const scans = run.work.flatMap((work) => work.scans);
    const improvements = run.work.flatMap((work) => work.improvements);
    const keyed = jobs.map((job) => `${job.idempotencyKey} ${job.subjectId}`);
    const unfinished = jobs.filter(({ status }) => !FINAL_JOBS.has(status));
    const leased = jobs.filter((job) => job.leaseExpiresAt !== null);
    const answered = scans.map(
      ({ key, scan }) => jobKeyed(run.stored, `scan:${key}`)?.id === scan.id,
    );

    expect(unfinished, TOLD).toEqual([]);
    expect(leased, TOLD).toEqual([]);
    expect(keyed.sort(), TOLD).toEqual(
      [
        ...scans.map(({ key, scan }) => `scan:${key} ${scan.repositoryId}`),
        ...improvements.map(({ id }) => `improvement:${id}:run ${id}`),
      ].sort(),
    );
    expect(answered, TOLD).not.toContain(false);
    expect(jobsEndedTwice(run.logs), TOLD).toEqual([]);
  });

  it('should run no job more often than the queue allows', () => {
    const { jobs } = run.stored;
    const overRun = jobs.filter(({ runs }) => runs > MAX_RUNS);
    const deadEarly = jobs.filter(
      ({ status, runs }) => status === 'dead' && runs < MAX_RUNS,
    );

    expect(overRun, TOLD).toEqual([]);
    expect(deadEarly, TOLD).toEqual([]);
  });

  it('should save one snapshot with every file for each scan that measured', () => {
    const { snapshots, jobs, improvements } = run.stored;
    const origins = new Set([
      ...jobs.map((job) => `${job.kind}:${job.id}`),
      ...improvements.map(({ id }) => `improvement:${id}:baseline`),
    ]);
    const measured = run.work
      .flatMap((work) => work.scans)
      .filter(({ scan }) => scan.status === 'completed');
    const strays = snapshots.filter(({ originKey }) => !origins.has(originKey));
    const partial = snapshots.filter(({ files }) => files !== MEASURED_FILES);
    const ids = measured.map(({ key, scan }) => ({
      answered: scan.snapshotId,
      kept: outcomeOf(jobKeyed(run.stored, `scan:${key}`))['snapshotId'],
      saved: snapshots.find(({ originKey }) => originKey === `scan:${scan.id}`)
        ?.id,
    }));

    expect(strays, TOLD).toEqual([]);
    expect(partial, TOLD).toEqual([]);
    expect(ids, TOLD).toEqual(
      measured.map(({ scan: { snapshotId } }) => ({
        answered: snapshotId,
        kept: snapshotId,
        saved: snapshotId,
      })),
    );
  });

  it('should end each improvement as asked, unless the stops spent its runs', () => {
    const cancelled = cancelAnswers(run.work)
      .filter(({ status }) => status === 'cancelled')
      .map(({ id }) => id);
    const endings = run.stored.improvements.map((improvement) => {
      const job = jobKeyed(run.stored, `improvement:${improvement.id}:run`);
      const { id, status, failureReason, targetFile } = improvement;
      const kept = outcomeOf(job)['outcome'];
      return {
        asked: cancelled.includes(id) ? CANCELLED : ASKED_ENDINGS[targetFile],
        ending: [status, failureReason, job?.status, kept].join(' '),
      };
    });
    const unasked = endings.filter(
      ({ asked, ending }) => ending !== SPENT && ending !== asked,
    );

    expect(unasked, TOLD).toEqual([]);
  });

  it('should give a cancel that meets the end of an improvement one outcome', () => {
    const answers = cancelAnswers(run.work);
    const stored = answers.map(({ id }) => ({
      status: run.stored.improvements.find((each) => each.id === id)?.status,
      job: jobKeyed(run.stored, `improvement:${id}:run`)?.status,
    }));

    expect(answers, TOLD).toHaveLength(SETTINGS.cancels.count);
    expect(stored, TOLD).toEqual(
      answers.map(({ status }) => ({ status, job: JOB_AT_END[status] })),
    );
  });

  it('should end each scan measured, unless the stops spent its runs', () => {
    const endings = run.stored.jobs
      .filter(({ kind }) => kind === 'scan')
      .map((job) => [job.status, outcomeOf(job)['outcome']].join(' '));

    expect(
      endings.filter((ending) => !SCAN_ENDINGS.has(ending)),
      TOLD,
    ).toEqual([]);
  });

  it('should publish each improvement at most once, as one branch and one pull request', () => {
    const { pulls, branches } = run.published;
    const { improvements } = run.stored;
    const heads = pulls.map(({ head }) => head);
    const owned = new Set(improvements.map(({ branch }) => branch));
    const completed = improvements.filter(
      ({ status }) => status === 'completed',
    );
    const opened = completed.map(({ branch }) => {
      const pull = pulls.find(({ head }) => head === branch);
      const pushed = branches.some((each) => each.branch === branch);
      return { number: pull?.number, url: pull?.url, pushed };
    });

    expect(
      heads.filter((head) => !owned.has(head)),
      TOLD,
    ).toEqual([]);
    expect(new Set(heads).size, TOLD).toBe(heads.length);
    expect(opened, TOLD).toEqual(
      completed.map(({ pullRequestNumber, pullRequestUrl }) => ({
        number: pullRequestNumber,
        url: pullRequestUrl,
        pushed: true,
      })),
    );
    expect(branches, TOLD).toEqual(
      branches.map(({ branch }) => ({
        branch,
        owned: true,
        commits: '1',
        changes: `A\t${NEW_TESTS}`,
      })),
    );
  });

  it('should hold each file by one live improvement at a time', () => {
    const byFile = Map.groupBy(
      run.stored.improvements,
      ({ repositoryId, targetFile }) => `${repositoryId} ${targetFile}`,
    );
    const overlapping = [...byFile.values()].flatMap((improvements) =>
      improvements
        .slice(1)
        .filter(
          (later, index) =>
            later.createdAt < String(improvements[index]?.phaseStartedAt),
        ),
    );
    const repeats = run.work.map(wrongRepeat).filter((wrong) => wrong !== null);

    expect(overlapping, TOLD).toEqual([]);
    expect(repeats, TOLD).toEqual([]);
  });

  it('should keep its database whole', () => {
    expect(run.database.integrity, TOLD).toEqual(['ok']);
    expect(run.database.brokenReferences, TOLD).toEqual([]);
  });

  it('should leave no working copy and no container once it started again', () => {
    expect(run.stops.at(-1)?.left, TOLD).toEqual(NOTHING_LEFT);
  });

  it('should log no fault that a stop or a cancel does not explain', () => {
    const faults = run.logs.flatMap((log) => unexplainedLines(log, MAX_RUNS));

    expect(faults, TOLD).toEqual([]);
  });

  describe('when it is told to end', () => {
    it('should exit with 0 and leave no socket, working copy or container', () => {
      const ends = cleanStops().map(({ exitCode, left }) => ({
        exitCode,
        left,
      }));

      expect(ends, TOLD).toEqual(
        cleanStops().map(() => ({ exitCode: 0, left: NOTHING_LEFT })),
      );
    });

    it('should end every job it took before it exits', () => {
      const left = cleanStops().flatMap(({ log }) => jobsLeftRunning(log));

      expect(left, TOLD).toEqual([]);
    });
  });
});
