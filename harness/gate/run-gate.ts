import { exitCodeOf } from '#harness/gate/exit-code';
import type { Host } from '#harness/gate/host';
import { planFor } from '#harness/gate/steps';

const DEFAULT_PROFILE = 'fast';

/**
 * Runs the steps of a profile, or one step, in order, and stops at the
 * first red one. A step that did not run has failed.
 */
export function runGate(args: readonly string[], host: Host): number {
  return exitCodeOf(host, () => {
    const name = args[0] ?? DEFAULT_PROFILE;
    const failed = planFor(name).find((step) => {
      host.print(`\n== ${step.name}`);
      return !host.start(step);
    });
    host.print(
      failed === undefined
        ? `\ncheck ${name}: passed`
        : `\ncheck ${name}: failed at ${failed.name}`,
    );
    return failed === undefined ? 0 : 1;
  });
}
