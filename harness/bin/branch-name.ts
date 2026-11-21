import { readCommitTypes } from '#harness/gate/commit-rules';
import { commandArguments, processHost } from '#harness/gate/host';
import { runBranchName } from '#harness/gate/run-branch-name';

process.exitCode = runBranchName(
  commandArguments(),
  processHost,
  readCommitTypes(),
);
