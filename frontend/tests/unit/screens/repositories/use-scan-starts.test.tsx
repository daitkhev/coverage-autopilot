import { Text } from 'ink';
import { cleanup, render } from 'ink-testing-library';
import { type ReactNode, useRef, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import type { Scan } from '@coverage-autopilot/api-contracts/scans';

import type { ServiceAnswer } from '#api/service-api';
import { useKeys } from '#hooks/use-keys';
import { useScanStarts } from '#screens/repositories/use-scan-starts';
import {
  answered,
  type FakeSession,
  fakeSession,
} from '#tests/support/fake-service-api';
import { PATIENT, press, screenOf } from '#tests/support/keys';
import { SCAN_BY_STATUS } from '#tests/support/sample-repositories';

const ACCEPTED = 202;
const REPOSITORY = 'repository-payments';

/**
 * `s` starts a scan twice in one press, as two presses do before the
 * screen is drawn again; `l` says a list was asked for.
 */
function Starting({ session }: { readonly session: FakeSession }): ReactNode {
  const asked = useRef(1);
  const [listedBy, setListedBy] = useState(1);
  const scans = useScanStarts({ session, asked, onNotice: () => undefined });
  useKeys(
    {
      s: () => {
        scans.start(REPOSITORY);
        scans.start(REPOSITORY);
      },
      l: () => {
        asked.current += 1;
        setListedBy(asked.current);
      },
    },
    { active: true },
  );
  return (
    <Text>
      {scans.starting(REPOSITORY, listedBy) ? 'starting' : 'not starting'}
    </Text>
  );
}

afterEach(cleanup);

describe('useScanStarts', () => {
  it('should send one request for presses that come before an answer', async () => {
    const starting = Promise.withResolvers<ServiceAnswer<Scan>>();
    const session = fakeSession({ startScan: () => starting.promise });
    const terminal = render(<Starting session={session} />);

    await press(terminal, 's');
    expect(screenOf(terminal)).toBe('starting');
    starting.resolve(answered(SCAN_BY_STATUS.queued, ACCEPTED));

    expect(
      session.api.calls.filter((call) => call.method === 'startScan'),
    ).toHaveLength(1);
  });

  it('should count as starting until a list asked for after it', async () => {
    const session = fakeSession({
      startScan: () =>
        Promise.resolve(answered(SCAN_BY_STATUS.queued, ACCEPTED)),
    });
    const terminal = render(<Starting session={session} />);

    await press(terminal, 's');
    await expect.poll(() => screenOf(terminal), PATIENT).toBe('starting');
    await press(terminal, 'l');

    expect(screenOf(terminal)).toBe('not starting');
  });
});
