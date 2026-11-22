import { processHost } from '#harness/gate/host';
import { runEndToEnd } from '#harness/gate/run-built-tests';

process.exitCode = await runEndToEnd(processHost);
