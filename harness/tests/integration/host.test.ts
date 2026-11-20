import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { commandArguments, processHost } from '#harness/gate/host';
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
  jest.restoreAllMocks();
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

  it('should print a line to the terminal', () => {
    const write = jest.spyOn(process.stdout, 'write').mockReturnValue(true);

    processHost.print('ratchet: no finding');

    expect(write).toHaveBeenCalledWith('ratchet: no finding\n');
  });
});

describe('commandArguments', () => {
  it('should leave Node and the script out', () => {
    const [node = '', script = ''] = process.argv;
    jest.replaceProperty(process, 'argv', [node, script, 'full', '--flag']);

    expect(commandArguments()).toEqual(['full', '--flag']);
  });
});
