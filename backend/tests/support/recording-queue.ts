import { Instant } from '#kernel/time/instant';
import type { Transaction } from '#kernel/transaction/transaction';
import type {
  EnqueueJobRequest,
  EnqueueJobResult,
  JobDto,
  JobId,
  JobKind,
  JobProgressDto,
  JobQueue,
  JobWait,
} from '#ports/job-queue.port';

interface Enqueued {
  readonly request: EnqueueJobRequest;
  readonly transaction: Transaction;
}

interface CancelledSubject {
  readonly subjectId: string;
  readonly transaction: Transaction;
}

interface CancelledJob {
  readonly jobId: JobId;
  readonly transaction: Transaction;
}

/** When the stand-in ends a job it cancels. */
export const CANCELLED_AT = Instant.parse('2026-03-04T05:10:00.000Z');

export interface RecordingQueue extends JobQueue {
  readonly enqueued: Enqueued[];
  readonly cancelledSubjects: CancelledSubject[];
  readonly cancelledJobs: CancelledJob[];
  /**
   * The jobs `getJob` finds, by their id: none at first. A cancel ends one
   * that has not ended, at `CANCELLED_AT`, as the queue of the service does.
   */
  readonly jobs: Map<JobId, JobDto>;
  /** What the next `enqueue` answers: `enqueued` as `job-1` at first. */
  answer: EnqueueJobResult;
  /** What `getProgress` answers for every subject: none at first. */
  progress: JobProgressDto | null;
  /** What `getWait` answers for every subject: a free worker at first. */
  wait: JobWait | null;
}

/** The leased job first, then the pending ones in the order they came. */
function openFirst(left: JobDto, right: JobDto): number {
  const leased = Number(right.status === 'leased');
  return (
    leased - Number(left.status === 'leased') ||
    left.createdAt.epochMilliseconds - right.createdAt.epochMilliseconds
  );
}

function openOf(
  jobs: ReadonlyMap<JobId, JobDto>,
  subjectId: string,
  kind: JobKind,
): JobDto | null {
  const open = [...jobs.values()].filter(
    (job) =>
      job.subjectId === subjectId && job.kind === kind && job.endedAt === null,
  );
  return open.sort(openFirst)[0] ?? null;
}

function runningOf(
  jobs: ReadonlyMap<JobId, JobDto>,
): Readonly<Record<JobKind, number>> {
  const leased = [...jobs.values()].filter((job) => job.status === 'leased');
  const count = (kind: JobKind): number =>
    leased.filter((job) => job.kind === kind).length;
  return { scan: count('scan'), improvement: count('improvement') };
}

/**
 * A queue that runs nothing and keeps every job it is given. It answers
 * the progress and the wait a test sets, the same for every subject, and
 * finds the jobs a test stores, the open job of a subject among them.
 */
export function recordingQueue(): RecordingQueue {
  const queue: RecordingQueue = {
    enqueued: [],
    cancelledSubjects: [],
    cancelledJobs: [],
    jobs: new Map(),
    answer: { outcome: 'enqueued', jobId: 'job-1' },
    progress: null,
    wait: 'worker',
    enqueue: async (request, transaction) => {
      queue.enqueued.push({ request, transaction });
      return Promise.resolve(queue.answer);
    },
    cancelSubject: async (subjectId, transaction) => {
      queue.cancelledSubjects.push({ subjectId, transaction });
      return Promise.resolve();
    },
    getJob: async (jobId) => Promise.resolve(queue.jobs.get(jobId) ?? null),
    getOpenJob: async (subjectId, kind) =>
      Promise.resolve(openOf(queue.jobs, subjectId, kind)),
    countRunning: async () => Promise.resolve(runningOf(queue.jobs)),
    getProgress: async () => Promise.resolve(queue.progress),
    getWait: async () => Promise.resolve(queue.wait),
    cancel: async (jobId, transaction) => {
      queue.cancelledJobs.push({ jobId, transaction });
      const job = queue.jobs.get(jobId);
      if (job?.endedAt === null) {
        queue.jobs.set(jobId, {
          ...job,
          status: 'cancelled',
          endedAt: CANCELLED_AT,
        });
      }
      return Promise.resolve();
    },
  };
  return queue;
}
