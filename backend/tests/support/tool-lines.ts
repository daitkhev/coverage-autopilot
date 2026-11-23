import { ToolLog } from '#infrastructure/logging/tool-log';
import { FixedClock } from '#tests/support/fixed-clock';
import { RecordingLogger } from '#tests/support/recording-logger';

/**
 * The clock of the runners of the tests. It stands still, so every call
 * a line tells of lasts 0 ms.
 */
export const TOOL_CLOCK = new FixedClock('2026-11-22T08:00:00.000Z');

/** The log of a runner of a test, which keeps its lines in `logger`. */
export function toolLogOf(logger = new RecordingLogger()): ToolLog {
  return new ToolLog(logger, TOOL_CLOCK);
}
