import { join, resolve } from 'node:path';

import {
  type JsonRecord,
  numberAt,
  readJsonRecord,
  recordAt,
} from '#harness/shared/json';

/** The folder of the harness this code runs from. */
export const HARNESS_ROOT = resolve(import.meta.dirname, '..');

/** The repository this harness belongs to. */
export const REPOSITORY_ROOT = resolve(HARNESS_ROOT, '..');

/** A file of `harness/policy/`, by its name. */
export function policyFile(name: string): string {
  return join(HARNESS_ROOT, 'policy', name);
}

/** The share of each counter that tests must reach, in percent. */
export interface CoverageFloors {
  readonly statements: number;
  readonly branches: number;
  readonly functions: number;
  readonly lines: number;
}

export interface Limits {
  readonly functionLines: number;
  readonly functionBranches: number;
  readonly functionDepth: number;
  readonly functionParameters: number;
  readonly fileLines: number;
  /** The share of duplicated lines the tree may have, in percent. */
  readonly duplicationPercent: number;
  readonly coverage: CoverageFloors;
  /** The kill rate each area must reach, in percent. Set by the owner. */
  readonly mutationFloors: ReadonlyMap<string, number>;
}

function mutationFloorsOf(file: JsonRecord): Map<string, number> {
  const floors = recordAt(file, 'mutation');
  return new Map(
    Object.keys(floors).map((area) => [area, numberAt(floors, area)]),
  );
}

function coverageOf(file: JsonRecord): CoverageFloors {
  const coverage = recordAt(file, 'coverage');
  return {
    statements: numberAt(coverage, 'statements'),
    branches: numberAt(coverage, 'branches'),
    functions: numberAt(coverage, 'functions'),
    lines: numberAt(coverage, 'lines'),
  };
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
    duplicationPercent: numberAt(recordAt(file, 'duplication'), 'percent'),
    coverage: coverageOf(file),
    mutationFloors: mutationFloorsOf(file),
  };
}
