import type { PullRequest } from '@coverage-autopilot/api-contracts/improvements';

import type { BrowserOpening } from '#api/browser';
import type { ClientSession } from '#api/client-session';
import { faultWords } from '#components/problem-details';
import { type ActionState, useAction } from '#hooks/use-action';

/** The pull request `o` opened, and what the browser did with it. */
interface Opened {
  readonly number: number;
  readonly opening: BrowserOpening;
}

/** The way to the pull request in the browser, and what it said last. */
export interface PullRequestLink {
  /** Opens a pull request, when the session can show a page at all. */
  readonly open: ((pullRequest: PullRequest) => void) | undefined;
  /** What the last open came to, in one line, or nothing yet. */
  readonly notice: string | undefined;
}

const NOT_STARTED = 'The browser did not start:';

function noticeOf(state: ActionState<Opened>): string | undefined {
  switch (state.phase) {
    case 'idle':
      return undefined;
    case 'running':
      return 'Starting the browser';
    case 'failed':
      return `${NOT_STARTED} ${faultWords(state.failure)}`;
    case 'ended': {
      const { number, opening } = state.outcome;
      return opening.outcome === 'started'
        ? `Pull request #${String(number)} opens in the browser.`
        : `${NOT_STARTED} ${opening.reason}`;
    }
  }
}

/**
 * Opens a pull request in the browser of the person, one at a time, and
 * says in one line whether the browser started. A session that cannot
 * show a page offers no way to.
 */
export function usePullRequestLink(session: ClientSession): PullRequestLink {
  const opening = useAction<Opened>();
  const { openInBrowser } = session;
  return {
    open:
      openInBrowser === undefined
        ? undefined
        : (pullRequest) => {
            opening.start(async () => ({
              number: pullRequest.number,
              opening: await openInBrowser(pullRequest.url),
            }));
          },
    notice: noticeOf(opening.state),
  };
}
