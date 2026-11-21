import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  commandArguments,
  processHost,
  settingsFrom,
} from '#harness/gate/host';
import { REPOSITORY_ROOT } from '#harness/shared/policy';

const SCRIPT = 'harness/fixtures/host/exit-with.ts';

function exitWith(code: string): boolean {
  return processHost.start({
    nodeOptions: [],
    script: SCRIPT,
    arguments: [code],
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('processHost', () => {
  it('should work on this repository', () => {
    expect(processHost.root).toBe(REPOSITORY_ROOT);
  });

  it('should say that a program that exits with zero passed', () => {
    expect(exitWith('0')).toBe(true);
  });

  it('should say that a program that exits with anything else failed', () => {
    expect(exitWith('3')).toBe(false);
  });

  it('should say that a program that could not start failed', () => {
    const missing = {
      nodeOptions: [],
      script: 'harness/gone.ts',
      arguments: [],
    };
    const options = ['--disable-warning=ExperimentalWarning'];

    expect(processHost.start(missing)).toBe(false);
    expect(
      processHost.start({
        nodeOptions: options,
        script: SCRIPT,
        arguments: ['0'],
      }),
    ).toBe(true);
  });

  it('should run a program that is not a script of Node', () => {
    expect(processHost.run('sh', ['-c', 'exit 0'])).toBe(true);
    expect(processHost.run('sh', ['-c', 'exit 3'])).toBe(false);
    expect(processHost.run('harness-no-such-program', [])).toBe(false);
  });

  it('should run a program in this repository', () => {
    expect(processHost.run('sh', ['-c', 'test -f harness/bin/check.ts'])).toBe(
      true,
    );
  });

  it('should print a line to the terminal', () => {
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);

    processHost.print('ratchet: no finding');

    expect(write).toHaveBeenCalledWith('ratchet: no finding\n');
  });
});

describe('settingsFrom', () => {
  const NAME = 'HARNESS_TEST_SETTING';
  const folder = mkdtempSync(join(tmpdir(), 'harness-settings-'));
  const file = join(folder, '.env');
  const setting = settingsFrom(file);

  afterEach(() => {
    rmSync(file, { force: true });
  });

  it('should say that a variable nobody set is not set', () => {
    vi.stubEnv(NAME, undefined);

    expect(setting(NAME)).toBeUndefined();
  });

  it('should read a variable of the shell, without the space around it', () => {
    vi.stubEnv(NAME, ' 3 ');

    expect(setting(NAME)).toBe('3');
  });

  it('should take an empty variable as not set', () => {
    vi.stubEnv(NAME, '  ');

    expect(setting(NAME)).toBeUndefined();
  });

  it('should read the file of local settings', () => {
    vi.stubEnv(NAME, undefined);
    writeFileSync(file, `${NAME}=from the file\n`);

    expect(setting(NAME)).toBe('from the file');
  });

  it('should let a variable of the shell win over the file', () => {
    vi.stubEnv(NAME, 'from the shell');
    writeFileSync(file, `${NAME}=from the file\n`);

    expect(setting(NAME)).toBe('from the shell');
  });
});

describe('the machine of processHost', () => {
  it('should read its settings from `.env` at the root', () => {
    vi.stubEnv('HARNESS_TEST_SETTING', 'set');

    expect(processHost.setting('HARNESS_TEST_SETTING')).toBe('set');
  });

  it('should know how many programs it can run at once', () => {
    expect(processHost.processors).toBe(availableParallelism());
  });
});

describe('commandArguments', () => {
  it('should leave Node and the script out', () => {
    const [node = '', script = ''] = process.argv;
    vi.spyOn(process, 'argv', 'get').mockReturnValue([
      node,
      script,
      'full',
      '--flag',
    ]);

    expect(commandArguments()).toEqual(['full', '--flag']);
  });
});
