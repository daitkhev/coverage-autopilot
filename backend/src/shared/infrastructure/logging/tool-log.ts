import type { Clock } from '#kernel/time/clock';
import type { Logger } from '#ports/logger.port';

/** A program the service starts, as its line names it. */
export interface ToolStart {
  /** The program, such as `git`. */
  readonly program: string;
  /**
   * Its arguments as a line may show them: every secret hidden, and
   * nothing that may carry a prompt or the text of a file.
   */
  readonly arguments: readonly string[];
}

/** Writes the line of one call, once the program ended. */
export type ToolEnd = (exitCode: number | null) => void;

/**
 * One line at debug for each program the service starts: the program,
 * the arguments its runner may show, the exit code, which is none when
 * the program did not start or a signal ended it, and how long it ran.
 * Never its environment, its input or its output. A runner calls the end
 * once, and the line is a debug one, since a journey starts many.
 */
export class ToolLog {
  private readonly logger: Logger;
  private readonly clock: Clock;

  public constructor(logger: Logger, clock: Clock) {
    this.logger = logger.child({ component: 'tools' });
    this.clock = clock;
  }

  public started(start: ToolStart): ToolEnd {
    const startedAt = this.clock.now().epochMilliseconds;
    return (exitCode) => {
      this.logger.debug('A program ended.', {
        program: start.program,
        arguments: start.arguments.join(' '),
        exitCode,
        durationMs: this.clock.now().epochMilliseconds - startedAt,
      });
    };
  }
}
