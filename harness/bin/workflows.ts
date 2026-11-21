import { processHost } from '#harness/gate/host';
import { outsideProgram } from '#harness/gate/outside-program';
import { runWorkflows } from '#harness/gate/run-workflows';

process.exitCode = runWorkflows(processHost, outsideProgram);
