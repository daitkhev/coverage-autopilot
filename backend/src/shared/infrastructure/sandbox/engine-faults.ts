import { SandboxEngineNotRunningError } from '#infrastructure/sandbox/errors/sandbox-engine-not-running.error';

/** What docker and podman print when no engine answers them. */
const NOT_RUNNING =
  /cannot connect to the docker daemon|failed to connect to the docker api|is the docker daemon running|cannot connect to podman/i;

/** The fault of an engine that does not answer, when that is what it said. */
export function notRunningFault(
  said: string,
): SandboxEngineNotRunningError | null {
  return NOT_RUNNING.test(said)
    ? new SandboxEngineNotRunningError(
        `No container engine answers. Start it and try again. It said: ${said}`,
      )
    : null;
}
