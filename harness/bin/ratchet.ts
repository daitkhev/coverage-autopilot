import { runRatchetCommand } from '#harness/architecture/ratchet-command';
import { commandArguments, processHost } from '#harness/gate/host';

process.exitCode = runRatchetCommand(commandArguments(), processHost);
