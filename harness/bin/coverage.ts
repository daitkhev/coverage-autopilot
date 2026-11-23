import { processHost } from '#harness/gate/host';
import { runCoverage } from '#harness/gate/run-coverage';

process.exitCode = runCoverage(processHost);
