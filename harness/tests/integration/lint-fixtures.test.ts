import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { beforeAll, describe, expect, it } from '@jest/globals';
import { ESLint } from 'eslint';

import { addedRuleIds, lintPolicy } from '#harness/eslint/config';
import { syntaxBans } from '#harness/eslint/restricted-syntax';
import { isRecord } from '#harness/shared/json';
import {
  HARNESS_ROOT,
  readLimits,
  REPOSITORY_ROOT,
} from '#harness/shared/policy';

const FIXTURES = join(HARNESS_ROOT, 'fixtures', 'lint');

interface Expectation {
  readonly rule: string | null;
  readonly says?: string;
}

interface Message {
  readonly rule: string | null;
  readonly text: string;
}

function namesIn(kind: string): string[] {
  return readdirSync(join(FIXTURES, kind))
    .map((file) => basename(file, '.ts'))
    .sort();
}

function readExpected(): Map<string, Expectation[]> {
  const file = join(FIXTURES, 'expected.json');
  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
  const entries = isRecord(parsed) ? Object.entries(parsed) : [];
  return new Map(entries.map(([name, list]) => [name, list as Expectation[]]));
}

const expected = readExpected();
const found = new Map<string, Message[]>();

beforeAll(async () => {
  const eslint = new ESLint({
    cwd: REPOSITORY_ROOT,
    overrideConfigFile: true,
    overrideConfig: lintPolicy,
  });
  const results = await eslint.lintFiles([join(FIXTURES, '**', '*.ts')]);
  for (const result of results) {
    const kind = basename(join(result.filePath, '..'));
    const messages = result.messages.map((message) => ({
      rule: message.ruleId,
      text: message.message,
    }));
    found.set(`${kind}/${basename(result.filePath, '.ts')}`, messages);
  }
}, 60_000);

describe('lint policy on its fixtures', () => {
  const names = [...expected.keys()].sort();

  it('should have a wrong and a right file for every case', () => {
    expect(namesIn('wrong')).toEqual(names);
    expect(namesIn('right')).toEqual(names);
  });

  it('should have a case for every rule the policy adds', () => {
    const covered = new Set(
      [...expected.values()].flat().map((item) => item.rule),
    );

    expect(addedRuleIds.filter((rule) => !covered.has(rule))).toEqual([]);
  });

  it('should have a case for every banned shape of code', () => {
    const texts = [...found.values()].flat().map((message) => message.text);
    const bans = syntaxBans(readLimits().functionParameters);

    expect(bans.filter((ban) => !texts.includes(ban.message))).toEqual([]);
  });

  it.each(names)('should report exactly its rule in wrong/%s', (name) => {
    const messages = found.get(`wrong/${name}`) ?? [];
    const wanted = expected.get(name) ?? [];

    expect(messages.map((message) => message.rule)).toEqual(
      wanted.map((item) => item.rule),
    );
    for (const [index, item] of wanted.entries()) {
      expect(messages[index]?.text).toContain(item.says ?? '');
    }
  });

  it.each(names)('should report nothing in right/%s', (name) => {
    expect(found.get(`right/${name}`)).toEqual([]);
  });
});
