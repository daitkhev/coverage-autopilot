import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DatabaseIntegrityError } from '#infrastructure/database/errors/database-integrity.error';
import {
  createdImprovement,
  improvementIn,
  type JourneySpec,
  STEP_MINUTE,
} from '#tests/support/improvement-journeys';
import {
  anotherOf,
  OTHER_FILE,
  sqliteStore,
} from '#tests/support/improvement-stores';
import {
  baselineOf,
  hashOf,
  IMPROVEMENT_ID,
  improvementIdOf,
  minutesIn,
} from '#tests/support/improvement-values';

let store: ReturnType<typeof sqliteStore>;

beforeEach(() => {
  store = sqliteStore();
});

afterEach(() => {
  store.remove();
});

function rows(sql: string): Record<string, unknown>[] {
  return store.database.connection.prepare(sql).all();
}

function documentIn(sql: string): unknown {
  const [row] = rows(sql);
  return JSON.parse(String(Object.values(row ?? {})[0]));
}

function run(sql: string): void {
  store.database.connection.exec(sql);
}

describe('SqliteImprovementRepository', () => {
  describe('insert', () => {
    it('should keep the request and the budget in their columns', async () => {
      await store.insert(improvementIn('verifying'));

      expect(
        rows(
          'SELECT mode, status, max_attempts, max_tokens, time_limit_ms, ' +
            'tokens_used, limit_waits, version FROM improvements',
        ),
      ).toEqual([
        {
          mode: 'automatic',
          status: 'verifying',
          max_attempts: 3,
          max_tokens: null,
          time_limit_ms: 1_800_000,
          tokens_used: 1500,
          limit_waits: 0,
          version: 1,
        },
      ]);
    });

    it('should keep each document with its version first', async () => {
      await store.insert(improvementIn('created'));

      expect(
        rows('SELECT quality_policy, generator_config FROM improvements'),
      ).toEqual([
        {
          quality_policy:
            '{"version":1,"requiredChecks":["test_files_only",' +
            '"new_tests_pass","mutation_gain"],"repeatedRuns":3,' +
            '"mutationThreshold":60}',
          generator_config:
            '{"version":1,"cli":"claude_code","model":"claude-sonnet",' +
            '"promptVersion":"v1","billing":"subscription"}',
        },
      ]);
    });

    it('should keep the patch of an attempt and what its call left behind', async () => {
      await store.insert(improvementIn('verifying'));

      expect(
        rows(
          'SELECT number, generation_outcome, tokens_used, patch_hash, ' +
            'verification_report, finished_at FROM attempts',
        ),
      ).toEqual([
        {
          number: 1,
          generation_outcome: 'generated',
          tokens_used: 1500,
          patch_hash: hashOf('a'),
          verification_report: null,
          finished_at: null,
        },
      ]);
      expect(documentIn('SELECT generation_output FROM attempts')).toEqual({
        version: 1,
        outputReferences: ['outputs/generator.json'],
        refusedToolCalls: [],
      });
    });

    it('should keep no output of an attempt before its first call', async () => {
      const improvement = improvementIn('generating');
      improvement.openAttempt(minutesIn(STEP_MINUTE.attemptOpened));

      await store.insert(improvement);

      expect(rows('SELECT generation_output FROM attempts')).toEqual([
        { generation_output: null },
      ]);
    });

    it('should give back a baseline of a policy without mutants', async () => {
      const improvement = improvementIn('analyzing');
      const baseline = baselineOf({ mutation: null });
      improvement.recordVerificationBaseline(baseline, minutesIn(2));

      await store.insert(improvement);

      const found = await store.repository.findById(improvementIdOf());
      expect(found?.verificationBaseline).toEqual(baseline);
    });
  });

  describe('when a unique index refuses an improvement', () => {
    const second = anotherOf(2);

    it.each<[string, JourneySpec, string]>([
      ['id', { ...second, id: IMPROVEMENT_ID, targetFile: OTHER_FILE }, 'id'],
      [
        'request key',
        { ...second, key: 'request-1', targetFile: OTHER_FILE },
        'request_key',
      ],
      [
        'fingerprint',
        { id: second.id, key: second.key, targetFile: OTHER_FILE },
        'request_fingerprint',
      ],
      ['open target', second, 'repository_id, improvements.target_file'],
    ])('should name the columns of the %s', async (_index, spec, columns) => {
      await store.insert(improvementIn('created'));

      await expect(store.insert(createdImprovement(spec))).rejects.toThrow(
        `UNIQUE constraint failed: improvements.${columns}`,
      );
    });
  });

  describe('save', () => {
    it('should write nothing when the transaction of the caller rolls back', async () => {
      const improvement = improvementIn('generating');
      await store.insert(improvement);
      improvement.openAttempt(minutesIn(STEP_MINUTE.attemptOpened));

      await expect(
        store.transactions.run(async (transaction) => {
          await store.repository.save(improvement, transaction);
          throw new Error('The worker stopped.');
        }),
      ).rejects.toThrow('The worker stopped.');

      expect(rows('SELECT version FROM improvements')).toEqual([
        { version: 1 },
      ]);
      expect(rows('SELECT number FROM attempts')).toEqual([]);
    });
  });

  describe('when a stored row is not one the service writes', () => {
    it.each([
      [
        'a document of another shape',
        'UPDATE improvements SET quality_policy = \'{"version":1}\'',
      ],
      ['a value the domain refuses', 'UPDATE improvements SET limit_waits = 5'],
      [
        'the branch of another improvement',
        "UPDATE improvements SET branch = 'main'",
      ],
      [
        'an attempt document of another version',
        'UPDATE attempts SET generation_output = \'{"version":2}\'',
      ],
      [
        'a text that is not JSON',
        'PRAGMA ignore_check_constraints = ON; ' +
          "UPDATE attempts SET generation_output = 'output'",
      ],
    ])('should throw DatabaseIntegrityError for %s', async (_problem, sql) => {
      await store.insert(improvementIn('verifying'));
      run(sql);

      await expect(
        store.repository.findById(improvementIdOf()),
      ).rejects.toThrow(DatabaseIntegrityError);
      await expect(store.repository.list({})).rejects.toMatchObject({
        code: 'database_integrity',
        retryable: false,
        message: expect.stringMatching(
          /^A stored improvement is not one this service writes: /,
        ) as unknown,
      });
    });

    it('should pass on a fault of the database itself as it came', async () => {
      await store.insert(improvementIn('created'));
      run('DROP TABLE attempts');

      await expect(
        store.repository.findById(improvementIdOf()),
      ).rejects.toThrow('no such table: attempts');
    });
  });

  describe('an attempt written before it kept its output', () => {
    it('should read with no output, no refused call and no tokens', async () => {
      await store.insert(improvementIn('verifying'));
      run('UPDATE attempts SET generation_output = NULL, tokens_used = NULL');

      const [attempt] =
        (await store.repository.findById(improvementIdOf()))?.attempts ?? [];

      expect(attempt?.outputReferences).toEqual([]);
      expect(attempt?.refusedToolCalls).toEqual([]);
      expect(attempt?.tokensUsed).toBe(0);
    });
  });
});
