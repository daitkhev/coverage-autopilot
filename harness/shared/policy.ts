import { join, resolve } from 'node:path';

import { numberAt, readJsonRecord, recordAt } from '#harness/shared/json';

/** The folder of the harness this code runs from. */
export const HARNESS_ROOT = resolve(import.meta.dirname, '..');

/** The repository this harness belongs to. */
export const REPOSITORY_ROOT = resolve(HARNESS_ROOT, '..');

/** A file of `harness/policy/`, by its name. */
export function policyFile(name: string): string {
  return join(HARNESS_ROOT, 'policy', name);
}

export interface Limits {
  readonly functionLines: number;
  readonly functionBranches: number;
  readonly functionDepth: number;
  readonly functionParameters: number;
  readonly fileLines: number;
}

export function readLimits(): Limits {
  const file = readJsonRecord(policyFile('limits.json'));
  const ofFunction = recordAt(file, 'function');
  return {
    functionLines: numberAt(ofFunction, 'lines'),
    functionBranches: numberAt(ofFunction, 'branches'),
    functionDepth: numberAt(ofFunction, 'depth'),
    functionParameters: numberAt(ofFunction, 'parameters'),
    fileLines: numberAt(recordAt(file, 'file'), 'lines'),
  };
}
