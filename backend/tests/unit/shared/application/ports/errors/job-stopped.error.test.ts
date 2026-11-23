import { describe, expect, it } from 'vitest';

import { ApplicationError } from '#kernel/errors/application.error';
import {
  JobStoppedError,
  type JobStopReason,
} from '#ports/errors/job-stopped.error';

function abortedWith(reason: unknown): AbortSignal {
  const controller = new AbortController();
  controller.abort(reason);
  return controller.signal;
}

describe('JobStoppedError', () => {
  it.each<JobStopReason>([
    'user_cancelled',
    'deadline_exceeded',
    'worker_shutdown',
    'lease_lost',
  ])('should say in a sentence why the job stopped: %s', (reason) => {
    const error = new JobStoppedError(reason);

    expect(error).toBeInstanceOf(ApplicationError);
    expect(error).toMatchObject({
      name: 'JobStoppedError',
      code: 'job_stopped',
      retryable: false,
      reason,
    });
    expect(error.message).toMatch(/^[A-Z].+\.$/);
  });

  describe('reasonOf', () => {
    it('should read the reason of a signal a job stopped with', () => {
      const signal = abortedWith(new JobStoppedError('worker_shutdown'));

      expect(JobStoppedError.reasonOf(signal)).toBe('worker_shutdown');
    });

    it('should give null for a signal that still runs', () => {
      expect(JobStoppedError.reasonOf(new AbortController().signal)).toBe(null);
    });

    it('should give null for a signal aborted for another reason', () => {
      expect(JobStoppedError.reasonOf(abortedWith('timeout'))).toBe(null);
    });
  });
});
