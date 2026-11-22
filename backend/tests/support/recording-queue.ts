import type { Transaction } from '#kernel/transaction/transaction';
import type {
  EnqueueJobRequest,
  EnqueueJobResult,
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

export interface RecordingQueue extends JobQueue {
  readonly enqueued: Enqueued[];
  readonly cancelledSubjects: CancelledSubject[];
  /** What the next `enqueue` answers: `enqueued` as `job-1` at first. */
  answer: EnqueueJobResult;
  /** What `getProgress` answers for every subject: none at first. */
  progress: JobProgressDto | null;
  /** What `getWait` answers for every subject: a free worker at first. */
  wait: JobWait | null;
}

async function refuse(): Promise<never> {
  return Promise.reject(new Error('A test of this queue only enqueues.'));
}

/**
 * A queue that runs nothing and keeps every job it is given. It answers
 * the progress and the wait a test sets, the same for every subject.
 */
export function recordingQueue(): RecordingQueue {
  const queue: RecordingQueue = {
    enqueued: [],
    cancelledSubjects: [],
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
    getProgress: async () => Promise.resolve(queue.progress),
    getWait: async () => Promise.resolve(queue.wait),
    cancel: refuse,
    getJob: refuse,
  };
  return queue;
}
