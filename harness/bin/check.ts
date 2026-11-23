import { commandArguments, processHost } from '#harness/gate/host';
import { runGate } from '#harness/gate/run-gate';

process.exitCode = runGate(commandArguments(), processHost);
