import { processHost } from '#harness/gate/host';
import { runStress } from '#harness/gate/run-built-tests';

process.exitCode = await runStress(processHost);
