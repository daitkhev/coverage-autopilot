import { processHost } from '#harness/gate/host';
import { runTypes } from '#harness/gate/run-types';

process.exitCode = runTypes(processHost);
