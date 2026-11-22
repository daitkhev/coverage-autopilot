import { processHost } from '#harness/gate/host';
import { runEndToEnd } from '#harness/gate/run-end-to-end';

process.exitCode = await runEndToEnd(processHost);
