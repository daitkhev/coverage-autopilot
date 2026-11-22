import { cleanup } from 'ink-testing-library';
import { afterEach, describe, expect, it } from 'vitest';

import type {
  ImprovementList,
  ImprovementListQuery,
} from '@coverage-autopilot/api-contracts/improvements';

import {
  filterHints,
  isNarrowed,
  keptBy,
  narrowingFacts,
  queryOf,
} from '#screens/improvements/improvement-filters';
import { ImprovementsScreen } from '#screens/improvements/improvements-screen';
import {
  answered,
  type FakeSession,
  fakeSession,
} from '#tests/support/fake-service-api';
import { KEYS, PATIENT, press, screenOf } from '#tests/support/keys';
import { sampleFrame, SECTION, SIZES, WIDE } from '#tests/support/sample-frame';
import {
  IMPROVEMENT_LIST,
  UNNARROWED,
} from '#tests/support/sample-improvements';
import {
  REPOSITORY_LIST,
  SCANNED_REPOSITORY,
} from '#tests/support/sample-repositories';
import { widestLine } from '#tests/support/terminal-text';
import { renderAt } from '#tests/support/wide-terminal';
import type { TerminalSize } from '#theme/widths';

const NAMES = new Map([[SCANNED_REPOSITORY.id, 'example/payments']]);

/** The list as the service narrows it by the query. */
function narrowedBy(query: ImprovementListQuery = {}): ImprovementList {
  return {
    items: IMPROVEMENT_LIST.items.filter(
      ({ status, repositoryId }) =>
        (query.status ?? status) === status &&
        (query.repositoryId ?? repositoryId) === repositoryId,
    ),
  };
}

async function shown(size: TerminalSize = WIDE) {
  const session = fakeSession({
    listImprovements: (query) => Promise.resolve(answered(narrowedBy(query))),
    listRepositories: () => Promise.resolve(answered(REPOSITORY_LIST)),
  });
  const terminal = renderAt(
    <ImprovementsScreen
      session={session}
      frame={sampleFrame(size, SECTION.improvements)}
      onOpenImprovement={() => undefined}
    />,
    size,
  );
  await expect
    .poll(() => screenOf(terminal), PATIENT)
    .toContain('src/billing/sum.ts');
  return { terminal, calls: session.api.calls };
}

/** The last query the list was asked with. */
function lastQuery(calls: FakeSession['api']['calls']): unknown {
  return calls.findLast((call) => call.method === 'listImprovements')
    ?.arguments[0];
}

afterEach(cleanup);

describe('queryOf', () => {
  it('should ask for the whole list when nothing narrows it', () => {
    expect(queryOf(UNNARROWED)).toEqual({});
  });

  it('should send the status and the repository', () => {
    expect(
      queryOf({ status: 'failed', repositoryId: SCANNED_REPOSITORY.id }),
    ).toEqual({ status: 'failed', repositoryId: SCANNED_REPOSITORY.id });
  });
});

describe('keptBy', () => {
  it('should pass a refusal and a missing answer as they are', () => {
    const refusal = {
      outcome: 'refused',
      error: { error: 'internal_error', message: 'Down.' },
    } as const;

    expect(keptBy(refusal, 'bill')).toBe(refusal);
    expect(keptBy(undefined, 'bill')).toBeUndefined();
  });
});

describe('narrowingFacts', () => {
  it('should name the repository, the status and the part of a path', () => {
    const narrowing = {
      status: 'waiting_for_limit',
      repositoryId: SCANNED_REPOSITORY.id,
      path: { ...UNNARROWED.path, text: 'bill' },
    } as const;

    expect(isNarrowed(narrowing)).toBe(true);
    expect(narrowingFacts(narrowing, NAMES)).toEqual([
      'example/payments',
      'only waiting for limit',
      'holding "bill"',
    ]);
  });

  it('should give the id of a repository it has no name for', () => {
    const narrowing = { ...UNNARROWED, repositoryId: 'repository-gone' };

    expect(narrowingFacts(narrowing, NAMES)).toEqual(['repository-gone']);
  });
});

describe('filterHints', () => {
  it('should leave the keys of the filters to the help at 80 columns', () => {
    expect(filterHints('narrow')).toEqual([]);
    expect(filterHints('compact').map(({ key }) => key)).toEqual([
      'f',
      'r',
      '/',
    ]);
  });
});

describe('useFilters', () => {
  it('should ask for one status after another on f, then for all', async () => {
    const { terminal, calls } = await shown();

    await press(terminal, 'f');
    await expect
      .poll(() => screenOf(terminal), PATIENT)
      .toContain('only created');
    expect(screenOf(terminal)).not.toContain('src/billing/sum.ts');
    expect(lastQuery(calls)).toEqual({ status: 'created' });

    await press(terminal, ...Array.from({ length: 11 }, () => 'f'));
    await expect
      .poll(() => screenOf(terminal), PATIENT)
      .toContain('src/billing/sum.ts');
    expect(lastQuery(calls)).toEqual({});
  });

  it('should narrow to one repository after another on r', async () => {
    const { terminal, calls } = await shown();

    await press(terminal, 'r');
    await expect
      .poll(() => lastQuery(calls), PATIENT)
      .toEqual({ repositoryId: SCANNED_REPOSITORY.id });

    await press(terminal, 'r');
    await expect
      .poll(() => screenOf(terminal), PATIENT)
      .toContain('No improvement matches the filters.');
    expect(screenOf(terminal)).toContain('f status');
  });

  it('should keep the files that hold the typed part of a path', async () => {
    const { terminal, calls } = await shown();

    await press(terminal, '/', 'R', 'e', 'f');

    const typing = screenOf(terminal);
    expect(typing).toContain('src/api/refund.ts');
    expect(typing).not.toContain('src/billing/sum.ts');
    expect(typing).toContain('enter accept');
    expect(lastQuery(calls)).toEqual({});

    await press(terminal, KEYS.enter);
    expect(screenOf(terminal)).toContain('holding "Ref"');
    expect(screenOf(terminal)).toContain('f status');
  });

  it('should throw the typed text away on esc', async () => {
    const { terminal } = await shown();

    await press(terminal, '/', 'x', 'y', KEYS.escape);

    expect(screenOf(terminal)).toContain('src/billing/sum.ts');
    expect(screenOf(terminal)).not.toContain('/xy');
  });

  it.each(SIZES)(
    'should fit in $columns by $rows while it types',
    async (size) => {
      const { terminal } = await shown(size);

      await press(terminal, 'f', '/', 's', 'r', 'c');

      const drawn = screenOf(terminal);
      expect(drawn).toContain('esc discard');
      expect(widestLine(drawn)).toBeLessThanOrEqual(size.columns);
      expect(drawn.split('\n').length).toBeLessThanOrEqual(size.rows);
    },
  );
});
