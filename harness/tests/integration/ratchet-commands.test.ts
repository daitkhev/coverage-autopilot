import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BASELINE, parseLists } from '#harness/architecture/baseline';
import {
  checkTree,
  compareWithBase,
  writeBaseline,
} from '#harness/architecture/commands';
import { LIMITS } from '#harness/architecture/limit-changes';
import type { Lists } from '#harness/architecture/lists';
import { HarnessError } from '#harness/shared/harness.error';
import {
  type TemporaryRepository,
  temporaryRepository,
} from '#harness/tests/support/temporary-repository';

const MIGRATION = 'backend/migrations/0001-first.sql';
const CONTRACT =
  'backend/src/modules/coverage/application/contracts/report.dto.ts';
const NO_COMMIT = '0000000000000000000000000000000000000000';

let repository: TemporaryRepository;

beforeEach(() => {
  repository = temporaryRepository();
});

afterEach(() => {
  repository.dispose();
});

function rulesFound(): string[] {
  return checkTree(repository.root).findings.map((finding) => finding.rule);
}

function recorded(): Lists {
  return parseLists(readFileSync(join(repository.root, BASELINE), 'utf8'));
}

function limits(lines: number, coverage: number): string {
  return JSON.stringify({
    schema: 1,
    file: { lines },
    coverage: { lines: coverage },
  });
}

describe('checkTree', () => {
  it('should fail a tree that has no baseline', () => {
    expect(rulesFound()).toEqual(['baseline']);
  });

  it('should fail a tree whose baseline cannot be read', () => {
    repository.write(BASELINE, '{"schema": 1,');

    expect(checkTree(repository.root).findings.map((f) => f.detail)).toEqual([
      `${BASELINE} is not JSON. Record it with \`npm run ratchet:write\`.`,
    ]);
  });

  it('should not hide a defect behind a finding', () => {
    repository.write(`${BASELINE}/in-the-way.txt`, 'a folder, not a file');

    expect(() => checkTree(repository.root)).toThrow(/EISDIR/);
  });

  it('should pass a tree that is what its baseline records', () => {
    repository.write(MIGRATION, 'create table a (id integer);\n');
    repository.write(CONTRACT, 'export interface ReportDto {}\n');
    writeBaseline(repository.root);

    expect(checkTree(repository.root)).toEqual({ findings: [], notes: [] });
  });

  it('should fail when the contracts of a module change', () => {
    writeBaseline(repository.root);
    repository.write(CONTRACT, 'export interface ReportDto {}\n');

    expect(rulesFound()).toEqual(['baseline']);
  });

  it('should fail on a migration that is not recorded', () => {
    writeBaseline(repository.root);
    repository.write(MIGRATION, 'create table a (id integer);\n');

    expect(rulesFound()).toEqual(['baseline']);
  });

  it('should fail on a recorded migration that changed', () => {
    repository.write(MIGRATION, 'create table a (id integer);\n');
    writeBaseline(repository.root);
    repository.write(MIGRATION, 'create table a (id text);\n');

    expect(rulesFound()).toEqual(['recorded-migration']);
  });

  it('should report the rules and the lists together', () => {
    repository.write('backend/src/modules/billing/domain/invoice.ts', '');

    expect(rulesFound()).toEqual(['unknown-module', 'baseline']);
  });
});

describe('writeBaseline', () => {
  it('should record every module and every migration', () => {
    repository.write(MIGRATION, 'create table a (id integer);\n');
    repository.write(CONTRACT, 'export interface ReportDto {}\n');

    const outcome = writeBaseline(repository.root);

    expect(outcome.notes).toEqual([`${BASELINE} was written.`]);
    expect(recorded().contracts).toEqual({
      coverage: ['ReportDto'],
      improvement: [],
      repositories: [],
      verification: [],
    });
    expect(Object.keys(recorded().migrations)).toEqual([MIGRATION]);
    expect(recorded().migrations[MIGRATION]).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should write over a baseline that cannot be read', () => {
    repository.write(BASELINE, 'not a baseline');

    expect(writeBaseline(repository.root).notes).toEqual([
      `${BASELINE} was written.`,
    ]);
    expect(checkTree(repository.root).findings).toEqual([]);
  });

  it('should say so when there is nothing new to record', () => {
    writeBaseline(repository.root);

    expect(writeBaseline(repository.root).notes).toEqual([
      `${BASELINE} is up to date.`,
    ]);
  });

  it('should refuse while a rule has a finding', () => {
    repository.write('backend/src/modules/billing/domain/invoice.ts', '');

    const outcome = writeBaseline(repository.root);

    expect(outcome.findings.map((finding) => finding.rule)).toEqual([
      'unknown-module',
    ]);
    expect(outcome.notes).toEqual(['Nothing was written.']);
    expect(existsSync(join(repository.root, BASELINE))).toBe(false);
  });

  it('should never accept a recorded migration that changed', () => {
    repository.write(MIGRATION, 'create table a (id integer);\n');
    writeBaseline(repository.root);
    const before = recorded();
    repository.write(MIGRATION, 'create table a (id text);\n');

    const outcome = writeBaseline(repository.root);

    expect(outcome.findings.map((finding) => finding.rule)).toEqual([
      'recorded-migration',
    ]);
    expect(recorded()).toEqual(before);
  });

  it('should never accept a recorded migration that is gone', () => {
    repository.write(MIGRATION, 'create table a (id integer);\n');
    writeBaseline(repository.root);
    repository.remove(MIGRATION);

    expect(writeBaseline(repository.root).notes).toEqual([
      'Nothing was written.',
    ]);
  });
});

describe('compareWithBase', () => {
  it('should have nothing to compare when there is no base', () => {
    expect(compareWithBase(repository.root, NO_COMMIT)).toEqual({
      findings: [],
      notes: ['There is no base: nothing to compare.'],
    });
  });

  it('should throw HarnessError for a base that is not a commit', () => {
    repository.commit();

    expect(() => compareWithBase(repository.root, 'no-such-branch')).toThrow(
      HarnessError,
    );
  });

  it('should say what a base from before the harness does not have', () => {
    const base = repository.commit();

    expect(compareWithBase(repository.root, base)).toEqual({
      findings: [],
      notes: [`${base} has no ${BASELINE}.`, `${base} has no ${LIMITS}.`],
    });
  });

  it('should catch a changed migration that a new baseline hides', () => {
    repository.write(MIGRATION, 'create table a (id integer);\n');
    writeBaseline(repository.root);
    const base = repository.commit();
    repository.write(MIGRATION, 'create table a (id text);\n');
    repository.remove(BASELINE);
    writeBaseline(repository.root);

    expect(rulesFound()).toEqual([]);
    expect(
      compareWithBase(repository.root, base).findings.map((f) => f.rule),
    ).toEqual(['recorded-migration']);
  });

  it('should catch a limit that got looser than the base has it', () => {
    repository.write(LIMITS, limits(300, 95));
    const base = repository.commit();
    repository.write(LIMITS, limits(400, 90));

    expect(
      compareWithBase(repository.root, base).findings.map((f) => f.detail),
    ).toEqual([
      '"coverage.lines" went down from 95 to 90. It moves one way.',
      '"file.lines" went up from 300 to 400. It moves one way.',
    ]);
  });

  it('should say so when the tree has no limits any more', () => {
    repository.write(LIMITS, limits(300, 95));
    const base = repository.commit();
    repository.remove(LIMITS);

    expect(compareWithBase(repository.root, base).notes).toContain(
      `This tree has no ${LIMITS}.`,
    );
  });

  it('should throw HarnessError for limits that are not an object', () => {
    repository.write(LIMITS, '[]');
    const base = repository.commit();
    repository.write(LIMITS, limits(300, 95));

    expect(() => compareWithBase(repository.root, base)).toThrow(
      `${LIMITS} must hold a JSON object.`,
    );
  });

  it('should pass a tree that only got stricter and only grew', () => {
    repository.write(LIMITS, limits(300, 95));
    repository.write(MIGRATION, 'create table a (id integer);\n');
    writeBaseline(repository.root);
    const base = repository.commit();
    repository.write(LIMITS, limits(250, 97));
    repository.write('backend/migrations/0002-second.sql', 'select 1;\n');

    expect(compareWithBase(repository.root, base).findings).toEqual([]);
  });

  it('should compare with a commit by any name git knows', () => {
    repository.write(LIMITS, limits(300, 95));
    repository.commit();
    repository.write(LIMITS, limits(301, 95));

    expect(compareWithBase(repository.root, 'HEAD').findings).toHaveLength(1);
    expect(compareWithBase(repository.root, 'main').findings).toHaveLength(1);
  });
});
