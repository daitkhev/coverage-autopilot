import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from '@jest/globals';

import { rulesOf } from '#harness/architecture/rules';
import { runRatchet } from '#harness/architecture/run';
import { HARNESS_ROOT, readStructure } from '#harness/shared/policy';

const FIXTURES = join(HARNESS_ROOT, 'fixtures', 'ratchet');
const WRONG = 'wrong-';
const RIGHT = 'right-';

interface Place {
  readonly rule: string;
  readonly path: string;
  readonly line: number;
}

function foldersOf(path: string): string[] {
  return readdirSync(path, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function casesOf(rule: string, prefix: string): string[] {
  const folder = join(FIXTURES, rule);
  const names = existsSync(folder) ? foldersOf(folder) : [];
  return names.filter((name) => name.startsWith(prefix));
}

function foundIn(rule: string, name: string): Place[] {
  return runRatchet(join(FIXTURES, rule, name)).map((finding) => ({
    rule: finding.rule,
    path: finding.path,
    line: finding.line,
  }));
}

function expectedIn(rule: string, name: string): unknown {
  const file = join(FIXTURES, rule, name, 'expected.json');
  return JSON.parse(readFileSync(file, 'utf8'));
}

const ruleIds = rulesOf(readStructure()).map((rule) => rule.id);

describe('ratchet on its fixtures', () => {
  it('should have fixtures for the rules that exist and for no other', () => {
    expect(foldersOf(FIXTURES)).toEqual([...ruleIds].sort());
  });

  describe.each(ruleIds)('%s', (rule) => {
    it('should have a case of each kind', () => {
      expect(casesOf(rule, WRONG)).not.toHaveLength(0);
      expect(casesOf(rule, RIGHT)).not.toHaveLength(0);
    });

    it('should know every folder as wrong or right', () => {
      const known = [...casesOf(rule, RIGHT), ...casesOf(rule, WRONG)];

      expect(foldersOf(join(FIXTURES, rule))).toEqual(known);
    });

    it.each(casesOf(rule, WRONG))(
      'should report exactly what %s expects',
      (name) => {
        expect(foundIn(rule, name)).toEqual(expectedIn(rule, name));
      },
    );

    it.each(casesOf(rule, WRONG))(
      'should report its own rule in %s',
      (name) => {
        const rules = foundIn(rule, name).map((place) => place.rule);

        expect(rules).toContain(rule);
        expect(new Set(rules).size).toBe(1);
      },
    );

    it.each(casesOf(rule, RIGHT))('should report nothing in %s', (name) => {
      expect(foundIn(rule, name)).toEqual([]);
    });
  });
});
