import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { runClient } from '#composition/client-process';

/**
 * The entry file of the service, which the build writes beside the one
 * of the client. The client starts it when no service answers.
 */
export const SERVICE_ENTRY = fileURLToPath(
  new URL('./service.js', import.meta.url),
);

/** The program and its file come first; the line of the user follows. */
const FIRST_ARGUMENT = 2;

if (import.meta.main) {
  const { stdout, stdin, stderr } = process;
  process.exitCode = await runClient({
    argv: process.argv.slice(FIRST_ARGUMENT),
    environment: process.env,
    service: [process.execPath, SERVICE_ENTRY],
    terminal: stdout.isTTY && stdin.isTTY ? { stdout, stdin } : undefined,
    out: (line) => {
      stdout.write(`${line}\n`);
    },
    err: (line) => {
      stderr.write(`${line}\n`);
    },
  });
}
