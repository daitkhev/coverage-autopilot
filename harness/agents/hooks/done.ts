import { runFullGate } from '#harness/agents/full-gate';
import { whenDone } from '#harness/agents/when-done';
import { REPOSITORY_ROOT } from '#harness/shared/policy';

process.stdout.write(whenDone(REPOSITORY_ROOT, runFullGate));
