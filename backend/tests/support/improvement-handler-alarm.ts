import type { Instant } from '#kernel/time/instant';
import type { Alarm, AlarmCancel } from '#ports/alarm.port';

interface SetAlarm {
  readonly moment: Instant;
  readonly ring: () => void;
  cancelled: boolean;
}

/**
 * An alarm that rings only when a test says so. It keeps every alarm that
 * was set, so a test sees the moments and what was taken back.
 */
export class ManualAlarm implements Alarm {
  private readonly alarms: SetAlarm[] = [];

  public set(moment: Instant, ring: () => void): AlarmCancel {
    const alarm: SetAlarm = { moment, ring, cancelled: false };
    this.alarms.push(alarm);
    return () => {
      alarm.cancelled = true;
    };
  }

  /** The moment of every alarm that was set, in order. */
  public get moments(): Instant[] {
    return this.alarms.map(({ moment }) => moment);
  }

  /** The moments of the alarms that were not taken back. */
  public get pending(): Instant[] {
    return this.alarms
      .filter(({ cancelled }) => !cancelled)
      .map(({ moment }) => moment);
  }

  /** Rings every alarm that is still set, as when its moment comes. */
  public ring(): void {
    for (const alarm of this.alarms) {
      if (!alarm.cancelled) {
        alarm.ring();
      }
    }
  }
}
