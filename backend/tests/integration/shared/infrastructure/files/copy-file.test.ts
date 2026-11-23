import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readCopyFile, REFUSAL_WORDS } from '#infrastructure/files/copy-file';

let folder: string;
let root: string;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'coverage-autopilot-copy-'));
  root = join(folder, 'copy');
  mkdirSync(join(root, 'reports'), { recursive: true });
  mkdirSync(join(folder, 'host'));
  writeFileSync(join(folder, 'host', 'secret.json'), '{"secret":true}');
});

afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

describe('readCopyFile', () => {
  it('should read a plain file of the copy', () => {
    writeFileSync(join(root, 'reports', 'report.json'), '{"a":1}');

    expect(readCopyFile(root, join(root, 'reports', 'report.json'))).toEqual({
      outcome: 'read',
      text: '{"a":1}',
    });
  });

  it('should say a file that is not there is missing', () => {
    expect(readCopyFile(root, join(root, 'reports', 'gone.json'))).toEqual({
      outcome: 'missing',
    });
  });

  it('should refuse a link, even to a file of the copy', () => {
    writeFileSync(join(root, 'real.json'), '{}');
    symlinkSync(join(root, 'real.json'), join(root, 'reports', 'link.json'));

    expect(readCopyFile(root, join(root, 'reports', 'link.json'))).toEqual({
      outcome: 'refused',
      reason: 'not_a_plain_file',
    });
  });

  it('should refuse a link to a device, which has no end', () => {
    symlinkSync('/dev/zero', join(root, 'reports', 'endless.json'));

    expect(readCopyFile(root, join(root, 'reports', 'endless.json'))).toEqual({
      outcome: 'refused',
      reason: 'not_a_plain_file',
    });
  });

  it('should refuse a folder', () => {
    expect(readCopyFile(root, join(root, 'reports'))).toEqual({
      outcome: 'refused',
      reason: 'not_a_plain_file',
    });
  });

  it('should refuse a file reached through a linked folder', () => {
    symlinkSync(join(folder, 'host'), join(root, 'cache'));

    expect(readCopyFile(root, join(root, 'cache', 'secret.json'))).toEqual({
      outcome: 'refused',
      reason: 'outside_the_copy',
    });
  });

  it('should refuse a file past the limit, and read one at it', () => {
    const path = join(root, 'reports', 'report.json');
    writeFileSync(path, '12345');

    expect(readCopyFile(root, path, 4)).toEqual({
      outcome: 'refused',
      reason: 'too_large',
    });
    expect(readCopyFile(root, path, 5).outcome).toBe('read');
  });

  it('should have words for every refusal', () => {
    expect(REFUSAL_WORDS).toEqual({
      not_a_plain_file: 'it is not a plain file',
      outside_the_copy: 'it leads out of the working copy',
      too_large: 'it is larger than any file the service reads',
    });
  });
});
