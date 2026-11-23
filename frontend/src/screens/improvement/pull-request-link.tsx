import type { PullRequest } from '@coverage-autopilot/api-contracts/improvements';

import type { BrowserOpening } from '#api/browser';
import type { ClientSession } from '#api/client-session';
import { faultWords } from '#components/problem-details';
import { useAction } from '#hooks/use-action';

const NOT_STARTED = 'The browser did not start:';

function openingWords(opening: BrowserOpening, number: number): string {
  return opening.outcome === 'started'
    ? `Pull request #${String(number)} opens in the browser.`
    : `${NOT_STARTED} ${opening.reason}`;
}

/** What the browser did with the pull request, as the line that says it. */
async function opened(
  open: NonNullable<ClientSession['openInBrowser']>,
  pullRequest: PullRequest,
): Promise<string> {
  try {
    return openingWords(await open(pullRequest.url), pullRequest.number);
  } catch (failure: unknown) {
    return `${NOT_STARTED} ${faultWords(failure)}`;
  }
}

/**
 * Opens a pull request in the browser of the person, one at a time, and
 * says in one line whether the browser started. A session that cannot
 * show a page gives no way to.
 */
export function usePullRequestLink(
  session: ClientSession,
  onNotice: (notice: string) => void,
): ((pullRequest: PullRequest) => void) | undefined {
  const opening = useAction<string>();
  const { openInBrowser } = session;
  return openInBrowser === undefined
    ? undefined
    : (pullRequest) => {
        opening.start(async () => {
          onNotice('Starting the browser');
          const said = await opened(openInBrowser, pullRequest);
          onNotice(said);
          return said;
        });
      };
}
