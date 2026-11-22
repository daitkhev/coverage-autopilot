import { Text } from 'ink';
import { cleanup, render } from 'ink-testing-library';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import type { Repository } from '@coverage-autopilot/api-contracts/repositories';
import type { SnapshotList } from '@coverage-autopilot/api-contracts/snapshots';

import type { ServiceAnswer, ServiceApi } from '#api/service-api';
import { RepositoriesScreen } from '#screens/repositories/repositories-screen';
import { runnerWords } from '#screens/repositories/repository-words';
import { useSnapshotParameters } from '#screens/repositories/use-snapshot-parameters';
import {
  answered,
  type FakeServiceApi,
  fakeServiceApi,
  fakeSession,
  refused,
} from '#tests/support/fake-service-api';
import { PATIENT, pause, screenOf } from '#tests/support/keys';
import { sampleFrame, SECTION, WIDE } from '#tests/support/sample-frame';
import { IMPROVEMENT_LIST } from '#tests/support/sample-improvements';
import {
  NEVER_SCANNED_REPOSITORY,
  OUTDATED_REPOSITORY,
  PAYMENTS_SNAPSHOT,
  PAYMENTS_SNAPSHOTS,
  REPOSITORY_LIST,
  SCAN_BY_STATUS,
  SCANNED_REPOSITORY,
} from '#tests/support/sample-repositories';
import { renderAt } from '#tests/support/wide-terminal';

/** Long enough for a second request to be sent, if one were. */
const SETTLE_MS = 100;

/** The snapshots of `example/billing-api`, measured by another runner. */
const BILLING_SNAPSHOTS: SnapshotList = {
  items: [
    {
      ...PAYMENTS_SNAPSHOT,
      id: 'snapshot-billing-api-1',
      repositoryId: OUTDATED_REPOSITORY.id,
      parameters: {
        testRunner: 'vitest',
        testRunnerVersion: '4.1.12',
        coverageProvider: 'v8',
        packageManager: 'npm',
        configFile: null,
        fileListRule: 'src/**/*.ts',
      },
    },
  ],
};

function snapshotsOf(repositoryId: string): ServiceAnswer<SnapshotList> {
  return answered(
    repositoryId === OUTDATED_REPOSITORY.id
      ? BILLING_SNAPSHOTS
      : PAYMENTS_SNAPSHOTS,
  );
}

const LISTED: Partial<ServiceApi> = {
  listSnapshots: (repositoryId) => Promise.resolve(snapshotsOf(repositoryId)),
};

function Runner({
  api,
  repository,
}: {
  readonly api: ServiceApi;
  readonly repository: Repository | undefined;
}): ReactNode {
  const parameters = useSnapshotParameters(api, repository);
  return (
    <Text>
      {parameters === undefined ? 'unknown' : runnerWords(parameters)}
    </Text>
  );
}

/** Draws the runner of one repository after another, as the list ticks. */
function drawn(api: FakeServiceApi, first: Repository | undefined) {
  const terminal = render(<Runner api={api} repository={first} />);
  return {
    terminal,
    show: (repository: Repository): void => {
      terminal.rerender(<Runner api={api} repository={repository} />);
    },
    asked: () =>
      api.calls
        .filter(({ method }) => method === 'listSnapshots')
        .map((call) => call.arguments[0]),
  };
}

afterEach(cleanup);

describe('useSnapshotParameters', () => {
  it('should ask once for a snapshot, however often the list ticks', async () => {
    const { terminal, show, asked } = drawn(
      fakeServiceApi(LISTED),
      SCANNED_REPOSITORY,
    );

    await expect.poll(() => screenOf(terminal), PATIENT).toBe('Jest 29');
    show({ ...SCANNED_REPOSITORY });
    show({ ...SCANNED_REPOSITORY });
    await pause(SETTLE_MS);

    expect(screenOf(terminal)).toBe('Jest 29');
    expect(asked()).toEqual([SCANNED_REPOSITORY.id]);
  });

  it('should ask for another snapshot, and keep the one it knows', async () => {
    const { terminal, show, asked } = drawn(
      fakeServiceApi(LISTED),
      SCANNED_REPOSITORY,
    );
    await expect.poll(() => screenOf(terminal), PATIENT).toBe('Jest 29');

    show(OUTDATED_REPOSITORY);
    await expect.poll(() => screenOf(terminal), PATIENT).toBe('Vitest 4');
    show(SCANNED_REPOSITORY);

    expect(screenOf(terminal)).toBe('Jest 29');
    expect(asked()).toEqual([SCANNED_REPOSITORY.id, OUTDATED_REPOSITORY.id]);
  });

  it('should ask nothing for a repository without a snapshot', async () => {
    const { terminal, show, asked } = drawn(fakeServiceApi(LISTED), undefined);

    show(NEVER_SCANNED_REPOSITORY);
    await pause(SETTLE_MS);

    expect(screenOf(terminal)).toBe('unknown');
    expect(asked()).toEqual([]);
  });

  it.each([
    {
      case: 'a refusal',
      listSnapshots: () =>
        Promise.resolve(
          refused(404, { error: 'not_found', message: 'No repository.' }),
        ),
    },
    {
      case: 'a list without the snapshot',
      listSnapshots: () => Promise.resolve(answered({ items: [] })),
    },
    {
      case: 'a fault',
      listSnapshots: () => Promise.reject(new TypeError('Not a list.')),
    },
  ])(
    'should leave the runner out after $case, and not ask again',
    async ({ listSnapshots }) => {
      const { terminal, show, asked } = drawn(
        fakeServiceApi({ listSnapshots }),
        SCANNED_REPOSITORY,
      );
      await expect.poll(asked, PATIENT).toHaveLength(1);

      show({ ...SCANNED_REPOSITORY });
      await pause(SETTLE_MS);

      expect(screenOf(terminal)).toBe('unknown');
      expect(asked()).toHaveLength(1);
    },
  );

  it('should name the runner beside the threshold of the chosen repository', async () => {
    const session = fakeSession({
      ...LISTED,
      listRepositories: () => Promise.resolve(answered(REPOSITORY_LIST)),
      getScan: () => Promise.resolve(answered(SCAN_BY_STATUS.running)),
      listImprovements: () => Promise.resolve(answered(IMPROVEMENT_LIST)),
    });
    const terminal = renderAt(
      <RepositoriesScreen
        session={session}
        frame={sampleFrame(WIDE, SECTION.repositories)}
        onOpenFiles={() => undefined}
      />,
      WIDE,
    );

    await expect
      .poll(() => screenOf(terminal), PATIENT)
      .toContain('threshold 80.0% of lines · Jest 29');
  });
});
