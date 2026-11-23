import { cleanup } from 'ink-testing-library';
import { afterEach, describe, expect, it } from 'vitest';

import type { BrowserOpening } from '#api/browser';
import type { ClientSession } from '#api/client-session';
import { ImprovementView } from '#screens/improvement/improvement-view';
import { fakeSession } from '#tests/support/fake-service-api';
import { PATIENT, press } from '#tests/support/keys';
import {
  FRESH_ANSWER,
  NARROW,
  sampleFrame,
  SECTION,
} from '#tests/support/sample-frame';
import { IMPROVEMENT_BY_STATUS } from '#tests/support/sample-improvements';
import { SCANNED_REPOSITORY } from '#tests/support/sample-repositories';
import { screenLog } from '#tests/support/sample-work-log';
import { drawnWith, widestLine } from '#tests/support/terminal-text';
import { frameOf, renderAt } from '#tests/support/wide-terminal';

const { completed, failed } = IMPROVEMENT_BY_STATUS;

function viewing(
  improvement: typeof completed,
  session: ClientSession = fakeSession({}),
) {
  const noted = screenLog();
  const view = (
    <ImprovementView
      session={session}
      frame={sampleFrame(NARROW, SECTION.improvements)}
      improvement={improvement}
      repository={SCANNED_REPOSITORY}
      freshness={FRESH_ANSWER}
      onOpenPatch={noted.onOpenPatch}
      onOpenImprovement={noted.onOpenImprovement}
      onBack={noted.onBack}
    />
  );
  const tree = <>{drawnWith({ animation: false }, view)}</>;
  return renderAt(tree, NARROW);
}

/** A session whose browser answers as a test says, and never opens. */
function answering(opening: () => Promise<BrowserOpening>): ClientSession {
  return { ...fakeSession({}), openInBrowser: opening };
}

afterEach(cleanup);

describe('usePullRequestLink', () => {
  it('should open the pull request in the browser on o and say so', async () => {
    const session = fakeSession({});
    const terminal = viewing(completed, session);
    expect(frameOf(terminal)).toContain('o pull request');

    await press(terminal, 'o');

    await expect
      .poll(() => frameOf(terminal), PATIENT)
      .toContain('Pull request #131 opens in the browser.');
    expect(session.pages).toEqual([
      'https://github.com/example/payments/pull/131',
    ]);
    expect(widestLine(frameOf(terminal))).toBeLessThanOrEqual(NARROW.columns);
  });

  it('should say in one line why the browser did not start', async () => {
    const terminal = viewing(
      completed,
      answering(async () =>
        Promise.resolve({ outcome: 'failed', reason: 'spawn open ENOENT' }),
      ),
    );

    await press(terminal, 'o');

    await expect
      .poll(() => frameOf(terminal), PATIENT)
      .toContain('The browser did not start: spawn open ENOENT');
  });

  it('should say what went wrong when the start itself broke', async () => {
    const terminal = viewing(
      completed,
      answering(async () => Promise.reject(new Error('No room.'))),
    );

    await press(terminal, 'o');

    await expect
      .poll(() => frameOf(terminal), PATIENT)
      .toContain('The browser did not start: No room.');
  });

  it('should say that the browser starts while it does', async () => {
    const terminal = viewing(
      completed,
      answering(async () => new Promise(() => undefined)),
    );

    await press(terminal, 'o');

    await expect
      .poll(() => frameOf(terminal), PATIENT)
      .toContain('Starting the browser');
  });

  it('should offer nothing for work with no pull request', async () => {
    const session = fakeSession({});
    const terminal = viewing(failed, session);

    await press(terminal, 'o');

    expect(frameOf(terminal)).not.toContain('o pull request');
    expect(session.pages).toEqual([]);
  });

  it('should offer nothing where the session shows no page', async () => {
    const { api, now, timeZone } = fakeSession({});
    const terminal = viewing(completed, { api, now, timeZone });

    await press(terminal, 'o');

    expect(frameOf(terminal)).not.toContain('o pull request');
    expect(frameOf(terminal)).not.toContain('browser');
  });
});
