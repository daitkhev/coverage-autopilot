import { describe, expect, it } from '@jest/globals';

import {
  BASELINE,
  formatLists,
  listFindings,
  migrationFindings,
  parseLists,
} from '#harness/architecture/baseline';
import type { Lists } from '#harness/architecture/lists';
import { HarnessError } from '#harness/shared/harness.error';

const FIRST = 'backend/migrations/0001-first.sql';
const SECOND = 'backend/migrations/0002-second.sql';

function listsOf(shape: Partial<Lists>): Lists {
  return {
    contracts: shape.contracts ?? {},
    migrations: shape.migrations ?? {},
  };
}

describe('formatLists', () => {
  it('should give text that parseLists reads back', () => {
    const lists = listsOf({
      contracts: { store: ['Item', 'find'] },
      migrations: { [FIRST]: 'aa' },
    });

    expect(parseLists(formatLists(lists))).toEqual(lists);
  });

  it('should end with a new line and hold no date', () => {
    const text = formatLists(listsOf({}));

    expect(text.endsWith('}\n')).toBe(true);
    expect(JSON.parse(text)).toEqual({
      schema: 1,
      lists: { contracts: {}, migrations: {} },
    });
  });
});

describe('parseLists', () => {
  it.each([
    ['another schema', '{"schema": 2, "lists": {}}'],
    ['no lists', '{"schema": 1, "contracts": {}, "migrations": {}}'],
    ['no contracts', '{"schema": 1, "lists": {"migrations": {}}}'],
    ['no migrations', '{"schema": 1, "lists": {"contracts": {}}}'],
    [
      'names that are not text',
      '{"schema": 1, "lists": {"contracts": {"a": [1]}, "migrations": {}}}',
    ],
    [
      'a hash that is not text',
      '{"schema": 1, "lists": {"contracts": {}, "migrations": {"a.sql": 1}}}',
    ],
    ['a list at the top', '[]'],
    ['text that is not JSON', '{"schema": 1,'],
  ])('should refuse a baseline with %s', (_, text) => {
    expect(() => parseLists(text)).toThrow(HarnessError);
  });
});

describe('migrationFindings', () => {
  it('should report a recorded migration that changed', () => {
    const recorded = listsOf({ migrations: { [FIRST]: 'aa' } });
    const current = listsOf({ migrations: { [FIRST]: 'bb' } });

    expect(migrationFindings(recorded, current)).toEqual([
      {
        rule: 'recorded-migration',
        path: FIRST,
        line: 1,
        detail:
          'A recorded migration was changed. Write a new migration instead.',
      },
    ]);
  });

  it('should report a recorded migration that is gone', () => {
    const recorded = listsOf({ migrations: { [FIRST]: 'aa' } });

    expect(migrationFindings(recorded, listsOf({}))).toEqual([
      {
        rule: 'recorded-migration',
        path: FIRST,
        line: 1,
        detail: 'A recorded migration was removed.',
      },
    ]);
  });

  it('should pass a new migration and an untouched one', () => {
    const recorded = listsOf({ migrations: { [FIRST]: 'aa' } });
    const current = listsOf({ migrations: { [FIRST]: 'aa', [SECOND]: 'bb' } });

    expect(migrationFindings(recorded, current)).toEqual([]);
  });
});

describe('listFindings', () => {
  it('should report a tree with no baseline', () => {
    expect(listFindings(undefined, listsOf({}))).toEqual([
      {
        rule: 'baseline',
        path: BASELINE,
        line: 1,
        detail: 'There is no baseline. Record it with `npm run ratchet:write`.',
      },
    ]);
  });

  it('should report a baseline that cannot be read, with the reason', () => {
    const unreadable = new HarnessError(`${BASELINE} is not JSON.`);

    expect(listFindings(unreadable, listsOf({}))).toEqual([
      {
        rule: 'baseline',
        path: BASELINE,
        line: 1,
        detail:
          'harness/baseline.json is not JSON. ' +
          'Record it with `npm run ratchet:write`.',
      },
    ]);
  });

  it('should pass a tree that is what the baseline records', () => {
    const lists = listsOf({
      contracts: { store: ['Item'] },
      migrations: { [FIRST]: 'aa' },
    });

    expect(listFindings(lists, lists)).toEqual([]);
  });

  it('should report contracts that grew and contracts that shrank', () => {
    const recorded = listsOf({ contracts: { store: ['Item', 'find'] } });
    const current = listsOf({ contracts: { store: ['Item', 'save'] } });

    expect(listFindings(recorded, current).map((f) => f.detail)).toEqual([
      'The contracts of store changed: added [save], removed [find]. ' +
        'Record it with `npm run ratchet:write`.',
    ]);
  });

  it('should report a module the baseline does not know', () => {
    const recorded = listsOf({ contracts: { store: [] } });
    const current = listsOf({ contracts: { store: [], runs: ['Run'] } });

    expect(listFindings(recorded, current)).toHaveLength(1);
  });

  it('should report a migration that is not recorded yet', () => {
    const current = listsOf({ migrations: { [FIRST]: 'aa' } });

    expect(listFindings(listsOf({}), current)).toEqual([
      {
        rule: 'baseline',
        path: FIRST,
        line: 1,
        detail:
          'This migration is not recorded. ' +
          'Record it with `npm run ratchet:write`.',
      },
    ]);
  });

  it('should report a recorded migration that changed', () => {
    const recorded = listsOf({ migrations: { [FIRST]: 'aa' } });
    const current = listsOf({ migrations: { [FIRST]: 'bb' } });

    expect(listFindings(recorded, current).map((f) => f.rule)).toEqual([
      'recorded-migration',
    ]);
  });
});
