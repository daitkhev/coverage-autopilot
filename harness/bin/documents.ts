import { processHost } from '#harness/gate/host';
import { runDocuments } from '#harness/gate/run-documents';

process.exitCode = runDocuments(processHost);
