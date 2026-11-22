import { processHost } from '#harness/gate/host';
import { runBuild } from '#harness/gate/run-build';

process.exitCode = await runBuild(processHost);
