import type { Transaction } from '#kernel/transaction/transaction';
import type {
  EnqueueJobRequest,
  EnqueueJobResult,
  JobQueue,
} from '#ports/job-queue.port';

interface Enqueued {
  readonly request: EnqueueJobRequest;
  readonly transaction: Transaction;
}

export interface RecordingQueue extends JobQueue {
  readonly enqueued: Enqueued[];
  /** What the next `enqueue` answers: `enqueued` as `job-1` at first. */
  answer: EnqueueJobResult;
}

async function refuse(): Promise<never> {
  return Promise.reject(new Error('A test of this queue only enqueues.'));
}

/** A queue that runs nothing and keeps every job it is given. */
export function recordingQueue(): RecordingQueue {
  const queue: RecordingQueue = {
    enqueued: [],
    answer: { outcome: 'enqueued', jobId: 'job-1' },
    enqueue: async (request, transaction) => {
      queue.enqueued.push({ request, transaction });
      return Promise.resolve(queue.answer);
    },
    cancel: refuse,
    cancelSubject: refuse,
    getJob: refuse,
    getProgress: refuse,
    getWait: refuse,
  };
  return queue;
}
