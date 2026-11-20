import { exitCodeOf } from '#harness/gate/exit-code';
import type { Host, NodeCommand } from '#harness/gate/host';
import { TOOLS } from '#harness/gate/tools';
import { readLimits } from '#harness/shared/policy';

/** jscpd over the tree, with the ceiling of the policy as its threshold. */
export function duplicationCommand(ceiling: number): NodeCommand {
  return {
    nodeOptions: [],
    script: TOOLS.jscpd,
    arguments: [
      '.',
      '--config',
      'harness/configs/jscpd.json',
      '--threshold',
      String(ceiling),
      '--fail-on-empty',
      '--no-colors',
    ],
  };
}

/**
 * Holds copy and paste at its ceiling. The ceiling is read when the step
 * runs, so the list of steps reads no file while it is loaded.
 */
export function runDuplication(host: Host): number {
  return exitCodeOf(host, () =>
    host.start(duplicationCommand(readLimits().duplicationPercent)) ? 0 : 1,
  );
}
