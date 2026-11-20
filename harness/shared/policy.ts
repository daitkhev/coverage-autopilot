import { join, resolve } from 'node:path';

import {
  numberAt,
  readJsonRecord,
  recordAt,
  stringListAt,
} from '#harness/shared/json';

/** The folder of the harness this code runs from. */
export const HARNESS_ROOT = resolve(import.meta.dirname, '..');

/** The repository this harness belongs to. */
export const REPOSITORY_ROOT = resolve(HARNESS_ROOT, '..');

export interface Structure {
  /** Extensions of the files the ratchet reads as source. */
  readonly extensions: readonly string[];
  /** Path prefixes that are not measured. */
  readonly excluded: readonly string[];
  /** Names a file or a folder may not have. */
  readonly bannedNames: readonly string[];
}

export interface Limits {
  readonly functionLines: number;
  readonly functionBranches: number;
  readonly functionDepth: number;
  readonly functionParameters: number;
  readonly fileLines: number;
}

export function readStructure(): Structure {
  const file = readJsonRecord(join(HARNESS_ROOT, 'policy', 'structure.json'));
  const source = recordAt(file, 'source');
  return {
    extensions: stringListAt(source, 'extensions'),
    excluded: stringListAt(source, 'excluded'),
    bannedNames: stringListAt(recordAt(file, 'names'), 'banned'),
  };
}

export function readLimits(): Limits {
  const file = readJsonRecord(join(HARNESS_ROOT, 'policy', 'limits.json'));
  const ofFunction = recordAt(file, 'function');
  return {
    functionLines: numberAt(ofFunction, 'lines'),
    functionBranches: numberAt(ofFunction, 'branches'),
    functionDepth: numberAt(ofFunction, 'depth'),
    functionParameters: numberAt(ofFunction, 'parameters'),
    fileLines: numberAt(recordAt(file, 'file'), 'lines'),
  };
}
