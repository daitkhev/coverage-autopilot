import { processHost } from '#harness/gate/host';
import { runMutation } from '#harness/gate/run-mutation';

process.exitCode = runMutation(processHost);
