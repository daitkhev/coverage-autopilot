import type { Clock } from '#kernel/time/clock';
import type { Instant } from '#kernel/time/instant';
import type { Alarm, AlarmCancel } from '#ports/alarm.port';
import { JobStoppedError } from '#ports/errors/job-stopped.error';

/** What the deadline of a run is read and kept with. */
interface DeadlineTools {
  readonly alarm: Alarm;
  readonly clock: Clock;
}

function nothingSet(): void {
  // No alarm is set yet, so there is nothing to take back.
}

function sameMoment(left: Instant | null, right: Instant | null): boolean {
  return left === null || right === null ? left === right : left.equals(right);
}

/**
 * The one signal of a run of an improvement. It stops with the job, for
 * the reason the job stopped, and when the deadline of the improvement
 * comes, with `deadline_exceeded`. The deadline exists only once work has
 * started and moves when a wait is left, so the run watches it again
 * after every save that may have changed it.
 */
export class RunDeadline {
  public readonly signal: AbortSignal;
  private readonly expiry = new AbortController();
  private readonly tools: DeadlineTools;
  private moment: Instant | null = null;
  private cancel: AlarmCancel = nothingSet;

  public constructor(jobSignal: AbortSignal, tools: DeadlineTools) {
    this.tools = tools;
    this.signal = AbortSignal.any([jobSignal, this.expiry.signal]);
  }

  /** Sets the alarm at the deadline, unless it is set there already. */
  public watch(deadline: Instant | null): void {
    if (sameMoment(this.moment, deadline)) {
      return;
    }
    this.release();
    this.moment = deadline;
    if (deadline !== null) {
      this.cancel = this.tools.alarm.set(deadline, () => {
        this.expiry.abort(new JobStoppedError('deadline_exceeded'));
      });
    }
  }

  /** Whether the alarm stopped the run, or the clock reached the deadline. */
  public hasPassed(): boolean {
    const { moment } = this;
    const reached = moment !== null && !this.tools.clock.now().isBefore(moment);
    return (
      reached || JobStoppedError.reasonOf(this.signal) === 'deadline_exceeded'
    );
  }

  /** Takes the alarm back, so that nothing of the run outlives it. */
  public release(): void {
    this.cancel();
    this.cancel = nothingSet;
  }
}
