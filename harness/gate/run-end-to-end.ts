import type { Host, NodeCommand } from '#harness/gate/host';
import { runBuild } from '#harness/gate/run-build';
import { END_TO_END_CONFIG, TOOLS } from '#harness/gate/tools';

/** Vitest over the end-to-end tests. It never writes a kept frame. */
export const END_TO_END_COMMAND: NodeCommand = {
  nodeOptions: [],
  script: TOOLS.vitest,
  arguments: ['run', '--config', END_TO_END_CONFIG, '--update=none'],
};

/**
 * Builds the service, then runs the tests that start the built file. The
 * step builds for itself, so it judges the tree it is given and never a
 * file an earlier build left, and it runs alone in a job of CI.
 */
export async function runEndToEnd(host: Host): Promise<number> {
  const built = await runBuild(host);
  if (built !== 0) {
    return built;
  }
  return host.start(END_TO_END_COMMAND) ? 0 : 1;
}
