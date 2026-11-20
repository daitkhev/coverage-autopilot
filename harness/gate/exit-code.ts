import type { Host } from '#harness/gate/host';
import { HarnessError } from '#harness/shared/harness.error';

/**
 * Runs a command of the harness and gives its exit code. An error of the
 * harness is said in one line and fails the command. Any other error is a
 * defect and is thrown on.
 */
export function exitCodeOf(host: Host, run: () => number): number {
  try {
    return run();
  } catch (error) {
    if (!(error instanceof HarnessError)) {
      throw error;
    }
    host.print(error.message);
    return 1;
  }
}
