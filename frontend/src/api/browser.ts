import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { platform } from 'node:process';

/** What became of a page sent to the browser: its program started, or why not. */
export type BrowserOpening =
  | { readonly outcome: 'started' }
  | { readonly outcome: 'failed'; readonly reason: string };

/** The program that hands a page to the browser, and all it is given. */
export interface BrowserProgram {
  readonly program: string;
  /** Exactly the variables the program gets, and nothing of the client's. */
  readonly variables: Readonly<Record<string, string>>;
}

/**
 * The folders of the programs of the system. The program and the ones it
 * calls are found there, and in no folder of the user's own.
 */
const SYSTEM_PATH = '/usr/bin:/bin:/usr/local/bin';

/** `open` on macOS, `xdg-open` elsewhere, with nothing but the path. */
export function browserProgramOf(system: string): BrowserProgram {
  return {
    program: system === 'darwin' ? 'open' : 'xdg-open',
    variables: { PATH: SYSTEM_PATH },
  };
}

function reasonOf(failure: unknown): string {
  return failure instanceof Error ? failure.message : String(failure);
}

/**
 * Hands an `https:` address to the program as one argument, never
 * through a shell, and does not wait for it to end. Any other address is
 * not sent. A program that cannot start is an outcome, not a fault.
 */
export async function openWith(
  browser: BrowserProgram,
  address: string,
): Promise<BrowserOpening> {
  const url = URL.parse(address);
  if (url?.protocol !== 'https:') {
    return { outcome: 'failed', reason: 'Only an https address is opened.' };
  }
  try {
    const child = spawn(browser.program, [url.href], {
      env: browser.variables,
      stdio: 'ignore',
      detached: true,
    });
    await once(child, 'spawn');
    child.unref();
    return { outcome: 'started' };
  } catch (failure: unknown) {
    return { outcome: 'failed', reason: reasonOf(failure) };
  }
}

/** Shows a page in the browser of the person, on the system it runs on. */
export async function openInBrowser(address: string): Promise<BrowserOpening> {
  return openWith(browserProgramOf(platform), address);
}
