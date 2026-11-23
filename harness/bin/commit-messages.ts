import { commandArguments, processHost } from '#harness/gate/host';
import { runCommitMessages } from '#harness/gate/run-commit-messages';

process.exitCode = runCommitMessages(commandArguments(), processHost);
