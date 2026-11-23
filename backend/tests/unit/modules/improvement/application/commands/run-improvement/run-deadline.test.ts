import { describe, expect, it } from 'vitest';

import { RunDeadline } from '#improvement/application/commands/run-improvement/run-deadline';
import { JobStoppedError } from '#ports/errors/job-stopped.error';
import { FixedClock } from '#tests/support/fixed-clock';
import { ManualAlarm } from '#tests/support/improvement-handler-alarm';
import { minutesIn } from '#tests/support/improvement-values';

const MINUTE_MS = 60_000;

const DEADLINE = minutesIn(30);

function deadlineOf(job = new AbortController()) {
  const alarm = new ManualAlarm();
  const clock = new FixedClock(minutesIn(10).toString());
  return {
    job,
    alarm,
    clock,
    deadline: new RunDeadline(job.signal, { alarm, clock }),
  };
}

describe('RunDeadline', () => {
  it('should stop when the job stops, for the same reason', () => {
    const { job, deadline } = deadlineOf();

    job.abort(new JobStoppedError('user_cancelled'));

    expect(JobStoppedError.reasonOf(deadline.signal)).toBe('user_cancelled');
    expect(deadline.hasPassed()).toBe(false);
  });

  it('should start stopped when the job has stopped already', () => {
    const job = new AbortController();
    job.abort(new JobStoppedError('worker_shutdown'));

    const { deadline } = deadlineOf(job);

    expect(JobStoppedError.reasonOf(deadline.signal)).toBe('worker_shutdown');
  });

  describe('watch', () => {
    it('should stop with deadline_exceeded when the alarm at the deadline rings', () => {
      const { alarm, deadline } = deadlineOf();

      deadline.watch(DEADLINE);
      alarm.ring();

      expect(alarm.moments).toEqual([DEADLINE]);
      expect(JobStoppedError.reasonOf(deadline.signal)).toBe(
        'deadline_exceeded',
      );
    });

    it('should keep the alarm of a deadline that did not move', () => {
      const { alarm, deadline } = deadlineOf();

      deadline.watch(DEADLINE);
      deadline.watch(minutesIn(30));

      expect(alarm.moments).toEqual([DEADLINE]);
      expect(alarm.pending).toEqual([DEADLINE]);
    });

    it('should take the alarm back and set another when the deadline moves', () => {
      const { alarm, deadline } = deadlineOf();
      const later = minutesIn(45);

      deadline.watch(DEADLINE);
      deadline.watch(later);

      expect(alarm.moments).toEqual([DEADLINE, later]);
      expect(alarm.pending).toEqual([later]);
    });

    it('should set no alarm for an improvement that has no deadline', () => {
      const { alarm, deadline } = deadlineOf();

      deadline.watch(DEADLINE);
      deadline.watch(null);

      expect(alarm.pending).toEqual([]);
      expect(deadline.hasPassed()).toBe(false);
    });
  });

  describe('hasPassed', () => {
    it('should pass at the deadline and not before', () => {
      const { clock, deadline } = deadlineOf();
      deadline.watch(DEADLINE);

      expect(deadline.hasPassed()).toBe(false);
      clock.advance(20 * MINUTE_MS);
      expect(deadline.hasPassed()).toBe(true);
    });

    it('should pass once the alarm rang, whatever the clock says', () => {
      const { alarm, deadline } = deadlineOf();
      deadline.watch(DEADLINE);

      alarm.ring();

      expect(deadline.hasPassed()).toBe(true);
    });
  });

  describe('release', () => {
    it('should take the alarm back', () => {
      const { alarm, deadline } = deadlineOf();
      deadline.watch(DEADLINE);

      deadline.release();
      alarm.ring();

      expect(alarm.pending).toEqual([]);
      expect(deadline.signal.aborted).toBe(false);
    });
  });
});
