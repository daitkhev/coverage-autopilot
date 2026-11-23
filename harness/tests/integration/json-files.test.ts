import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { HarnessError } from '#harness/shared/harness.error';
import { readJsonRecord } from '#harness/shared/json';

const folder = mkdtempSync(join(tmpdir(), 'harness-json-'));

function fileWith(name: string, text: string): string {
  const path = join(folder, name);
  writeFileSync(path, text);
  return path;
}

afterAll(() => {
  rmSync(folder, { recursive: true });
});

describe('readJsonRecord', () => {
  it('should read an object', () => {
    expect(readJsonRecord(fileWith('a.json', '{"a": 1}'))).toEqual({ a: 1 });
  });

  it('should throw HarnessError for a list', () => {
    expect(() => readJsonRecord(fileWith('b.json', '[1]'))).toThrow(
      HarnessError,
    );
  });

  it('should fail on text that is not JSON', () => {
    expect(() => readJsonRecord(fileWith('c.json', 'not json'))).toThrow(
      SyntaxError,
    );
  });
});
