import type { SandboxSettings } from '#infrastructure/sandbox/sandbox-settings';
import type { SandboxCommandRequest } from '#ports/sandbox.port';

/** The label that names the instance of the service on its containers. */
const INSTANCE_LABEL = 'coverage-autopilot.instance';

/** The engine reads the variables of the command from what it is given. */
const VARIABLES_FROM_INPUT = '/dev/stdin';

/**
 * The scratch folder may hold programs, as a test runner unpacks them: the
 * working copy is writable and runs programs anyway, so `noexec` would add
 * nothing.
 */
const SCRATCH = '/tmp:rw,nosuid,nodev,exec';

function megabytes(value: number): string {
  return `${String(value)}m`;
}

/**
 * The arguments of one `run`. The container has no capability, cannot
 * gain a privilege, runs as a user that is not root, and writes only to
 * the working copy and to a scratch folder in memory. The working copy is
 * its only mount: no socket of the engine, no data of the service. It is
 * mounted at the path it has on the host, so a path a tool writes into a
 * report is the path the service reads the report by. Its label names
 * the instance that started it. Without `--network`, the engine gives its
 * default network.
 */
export function runArguments(
  settings: SandboxSettings,
  name: string,
  request: SandboxCommandRequest,
): string[] {
  const { limits } = settings;
  const network = request.network === 'none' ? ['--network', 'none'] : [];
  const copy = request.workingCopyPath;
  const label = `${INSTANCE_LABEL}=${settings.instance}`;
  return [
    ...['run', '--name', name, '--label', label, '--rm', '--init'],
    ...network,
    ...['--cap-drop', 'ALL', '--security-opt', 'no-new-privileges'],
    ...['--user', settings.user, '--read-only'],
    ...['--tmpfs', `${SCRATCH},size=${megabytes(limits.scratchMb)}`],
    ...['--memory', megabytes(limits.memoryMb)],
    ...['--memory-swap', megabytes(limits.memoryMb)],
    ...['--cpus', String(limits.cpus)],
    ...['--pids-limit', String(limits.processes)],
    '--mount',
    `type=bind,source=${copy},target=${copy}`,
    ...['--workdir', copy, '--env-file', VARIABLES_FROM_INPUT],
    settings.image,
    ...request.command,
  ];
}

/** Stops the container if it still runs, and removes it. */
export function removeArguments(name: string): string[] {
  return ['rm', '--force', name];
}
