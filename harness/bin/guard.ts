import { commandArguments, processHost } from '#harness/gate/host';
import { runGuard } from '#harness/gate/run-guard';
import { readFrozenPolicy } from '#harness/shared/frozen';

process.exitCode = runGuard(
  commandArguments(),
  processHost,
  readFrozenPolicy(),
);
