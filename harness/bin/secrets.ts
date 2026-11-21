import { processHost } from '#harness/gate/host';
import { outsideProgram } from '#harness/gate/outside-program';
import { runSecrets } from '#harness/gate/run-secrets';

process.exitCode = runSecrets(processHost, outsideProgram);
