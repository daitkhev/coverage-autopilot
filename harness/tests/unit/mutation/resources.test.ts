import { describe, expect, it } from 'vitest';

import {
  describeResources,
  engineOptions,
  type Machine,
  resourcesOf,
  SETTINGS,
} from '#harness/mutation/resources';
import { HarnessError } from '#harness/shared/harness.error';

function machine(
  settings: Record<string, string> = {},
  processors = 8,
): Machine {
  return { setting: (name) => settings[name], processors };
}

describe('resourcesOf', () => {
  it('should start four test runners in four gigabytes when nothing is set', () => {
    expect(resourcesOf(machine())).toEqual({
      workers: 4,
      heapMb: 640,
      timeoutMs: 15_000,
    });
  });

  it('should start one test runner for each processor of a small machine', () => {
    expect(resourcesOf(machine({}, 2)).workers).toBe(2);
  });

  it('should take the number of test runners a person set', () => {
    const set = machine({
      [SETTINGS.workers]: '6',
      [SETTINGS.memoryMb]: '8192',
    });

    expect(resourcesOf(set)).toEqual({
      workers: 6,
      heapMb: 1024,
      timeoutMs: 15_000,
    });
  });

  it('should start fewer test runners when the memory does not hold them', () => {
    const tight = machine({ [SETTINGS.memoryMb]: '2048' });

    expect(resourcesOf(tight)).toEqual({
      workers: 2,
      heapMb: 512,
      timeoutMs: 15_000,
    });
  });

  it('should work with one test runner in the least memory', () => {
    const least = machine({ [SETTINGS.memoryMb]: '1280' });

    expect(resourcesOf(least)).toEqual({
      workers: 1,
      heapMb: 512,
      timeoutMs: 15_000,
    });
  });

  it('should give the spare memory to the test runners it starts', () => {
    const spare = machine({
      [SETTINGS.workers]: '1',
      [SETTINGS.memoryMb]: '2048',
    });

    expect(resourcesOf(spare).heapMb).toBe(1280);
  });

  it('should refuse memory that holds no test runner', () => {
    const short = machine({ [SETTINGS.memoryMb]: '1279' });

    expect(() => resourcesOf(short)).toThrow(
      new HarnessError(
        'HARNESS_MUTATION_MEMORY_MB is 1279. One test runner needs 1280.',
      ),
    );
  });

  it('should take the time limit a person set', () => {
    const slow = machine({ [SETTINGS.timeoutMs]: '120000' });

    expect(resourcesOf(slow).timeoutMs).toBe(120_000);
  });

  it.each([
    [SETTINGS.workers, '0'],
    [SETTINGS.workers, '-2'],
    [SETTINGS.workers, '1.5'],
    [SETTINGS.memoryMb, 'much'],
    [SETTINGS.timeoutMs, '60s'],
  ])('should refuse %s set to "%s"', (name, text) => {
    expect(() => resourcesOf(machine({ [name]: text }))).toThrow(
      new HarnessError(
        `${name} must be a whole number above zero, and it is "${text}".`,
      ),
    );
  });
});

describe('engineOptions', () => {
  it('should give the engine the test runners, their heap and the time limit', () => {
    const options = engineOptions({ workers: 2, heapMb: 512, timeoutMs: 9 });

    expect(options).toEqual([
      '--concurrency',
      '2',
      '--testRunnerNodeArgs=--max-old-space-size=512',
      '--timeoutMS',
      '9',
    ]);
  });
});

describe('describeResources', () => {
  it('should say in one line what the run may take', () => {
    const line = describeResources({ workers: 2, heapMb: 512, timeoutMs: 9 });

    expect(line).toBe(
      '2 test runner(s), 512 MB of heap each, a time limit of 9 ms',
    );
  });
});
