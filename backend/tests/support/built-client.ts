import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { execPath } from 'node:process';
import { text } from 'node:stream/consumers';
import { setTimeout } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

/**
 * The client of the package the gate builds. The client and the service
 * are one package, and the client starts the service built beside it.
 */
const BUILT_CLIENT = fileURLToPath(
  new URL('../../../dist/bin/client.js', import.meta.url),
);

/** How a run of the client ended, and everything it wrote. */
export interface ClientEnd {
  /** The exit code, or `null` when a signal ended the run. */
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** What a run that did not end by its deadline gives instead of its end. */
export const HUNG = 'hung' as const;

/** A run of the built client as a process of its own. */
export interface BuiltClient {
  /** The end of the run, or `HUNG` once the deadline passed before it. */
  ended(deadlineMs: number): Promise<ClientEnd | typeof HUNG>;
  /**
   * Kills a run that still runs. A service it started is detached from
   * it, and is not ended with it.
   */
  kill(): void;
}

async function endOf(
  child: ReturnType<typeof spawnedClient>,
): Promise<ClientEnd> {
  const [stdout, stderr, [code, signal]] = await Promise.all([
    text(child.stdout),
    text(child.stderr),
    once(child, 'close') as Promise<[number | null, NodeJS.Signals | null]>,
  ]);
  return { code, signal, stdout, stderr };
}

function spawnedClient(
  variables: Readonly<Record<string, string>>,
  line: readonly string[],
) {
  return spawn(execPath, [BUILT_CLIENT, ...line], {
    env: variables,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/**
 * Runs the built client on the words of `line`, with exactly these
 * variables and nothing of the test process. A service it starts gets
 * the same variables. A deadline that passes leaves no timer behind that
 * keeps the test process alive.
 */
export function startBuiltClient(
  variables: Readonly<Record<string, string>>,
  line: readonly string[],
): BuiltClient {
  const child = spawnedClient(variables, line);
  const end = endOf(child);
  return {
    ended: async (deadlineMs) =>
      Promise.race([end, setTimeout(deadlineMs, HUNG, { ref: false })]),
    kill: () => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
    },
  };
}
