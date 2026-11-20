import { processHost } from '#harness/gate/host';
import { runDuplication } from '#harness/gate/run-duplication';

process.exitCode = runDuplication(processHost);
