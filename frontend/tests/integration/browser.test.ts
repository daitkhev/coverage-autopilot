import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { browserProgramOf, openInBrowser, openWith } from '#api/browser';

/**
 * A stand-in for the program of the browser: it writes its arguments, one
 * a line, and its variables to files beside it, and starts no browser.
 */
const STAND_IN = [
  '#!/bin/sh',
  'printf "%s\\n" "$@" > "$RECORD.args"',
  'env > "$RECORD.env"',
  '',
].join('\n');

const OWNER_RUNS = 0o700;

/** Characters a shell would act on, which the program must get as they are. */
const ADDRESS = 'https://github.com/example/payments/pull/131?a=$HOME;b=`id`';

const PATIENT = { timeout: 5000, interval: 10 };

describe('openWith', () => {
  let folder: string;
  let record: string;
  let program: string;

  beforeEach(() => {
    folder = mkdtempSync('/tmp/browser-');
    record = join(folder, 'record');
    program = join(folder, 'stand-in');
    writeFileSync(program, STAND_IN, { mode: OWNER_RUNS });
  });

  afterEach(() => {
    rmSync(folder, { recursive: true, force: true });
  });

  function standIn() {
    return { program, variables: { PATH: '/usr/bin:/bin', RECORD: record } };
  }

  it('should hand the address over as one argument, with no shell between', async () => {
    await expect(openWith(standIn(), ADDRESS)).resolves.toEqual({
      outcome: 'started',
    });

    await vi.waitFor(() => {
      expect(existsSync(`${record}.env`)).toBe(true);
    }, PATIENT);
    expect(readFileSync(`${record}.args`, 'utf8')).toBe(`${ADDRESS}\n`);
  });

  it('should give the program only the variables it names', async () => {
    await openWith(standIn(), ADDRESS);

    await vi.waitFor(() => {
      expect(readFileSync(`${record}.env`, 'utf8')).toContain(
        'PATH=/usr/bin:/bin',
      );
    }, PATIENT);
    expect(readFileSync(`${record}.env`, 'utf8')).not.toMatch(/^HOME=/mu);
  });

  it('should send no address but an https one', async () => {
    await expect(
      openWith(standIn(), 'http://github.com/example/payments/pull/131'),
    ).resolves.toEqual({
      outcome: 'failed',
      reason: 'Only an https address is opened.',
    });
    expect(existsSync(`${record}.args`)).toBe(false);
  });

  it('should say why a program that cannot start did not', async () => {
    const missing = { program: join(folder, 'missing'), variables: {} };

    const opening = await openWith(missing, ADDRESS);

    expect(opening.outcome).toBe('failed');
    expect(opening.outcome === 'failed' ? opening.reason : '').toContain(
      'ENOENT',
    );
  });
});

describe('browserProgramOf', () => {
  it('should use open on macOS and xdg-open elsewhere', () => {
    expect(browserProgramOf('darwin').program).toBe('open');
    expect(browserProgramOf('linux').program).toBe('xdg-open');
  });

  it('should give the program the folders of the system alone', () => {
    expect(browserProgramOf('darwin').variables).toEqual({
      PATH: '/usr/bin:/bin:/usr/local/bin',
    });
  });
});

describe('openInBrowser', () => {
  it('should refuse an address that is not https before it starts anything', async () => {
    await expect(openInBrowser('file:///etc/passwd')).resolves.toEqual({
      outcome: 'failed',
      reason: 'Only an https address is opened.',
    });
  });
});
