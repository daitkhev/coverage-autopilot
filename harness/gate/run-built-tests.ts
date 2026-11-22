import type { Host, NodeCommand } from '#harness/gate/host';
import { runBuild } from '#harness/gate/run-build';
import { END_TO_END_CONFIG, STRESS_CONFIG, TOOLS } from '#harness/gate/tools';

/** Vitest over the tests of one configuration. It never writes a kept frame. */
function vitestOver(config: string): NodeCommand {
  return {
    nodeOptions: [],
    script: TOOLS.vitest,
    arguments: ['run', '--config', config, '--update=none'],
  };
}

/** Vitest over the end-to-end tests. */
export const END_TO_END_COMMAND: NodeCommand = vitestOver(END_TO_END_CONFIG);

/** Vitest over the stress tests. */
export const STRESS_COMMAND: NodeCommand = vitestOver(STRESS_CONFIG);

/**
 * Builds the service, then runs tests that start the built file. A step
 * builds for itself, so it judges the tree it is given and never a file
 * an earlier build left, and it runs alone in a job of CI.
 */
async function runOnBuilt(host: Host, tests: NodeCommand): Promise<number> {
  const built = await runBuild(host);
  if (built !== 0) {
    return built;
  }
  return host.start(tests) ? 0 : 1;
}

/** The tests that walk the built service as a client does. */
export async function runEndToEnd(host: Host): Promise<number> {
  return runOnBuilt(host, END_TO_END_COMMAND);
}

/**
 * The tests that load the built service and stop it at random. One that
 * fails is a finding, so the step runs each once and never again.
 */
export async function runStress(host: Host): Promise<number> {
  return runOnBuilt(host, STRESS_COMMAND);
}
