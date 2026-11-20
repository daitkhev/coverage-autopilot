import {
  type JsonRecord,
  readJsonRecord,
  recordAt,
  stringAt,
  stringListAt,
} from '#harness/shared/json';
import { policyFile } from '#harness/shared/policy';

/** A part of the code whose tests are held to one kill rate. */
export interface Area {
  readonly name: string;
  /** Places the area holds: a folder ends with a slash. */
  readonly places: readonly string[];
  /** Places inside those that are not part of the area. */
  readonly excluded: readonly string[];
}

/** One run of the mutation engine, and the areas its report is read for. */
export interface MutationRun {
  readonly name: string;
  /** The configuration of the engine, from the root of the tree. */
  readonly config: string;
  /** Where the engine writes its report, from the root of the tree. */
  readonly report: string;
  readonly areas: readonly Area[];
}

function areasOf(run: JsonRecord): Area[] {
  const areas = recordAt(run, 'areas');
  return Object.keys(areas).map((name) => {
    const area = recordAt(areas, name);
    return {
      name,
      places: stringListAt(area, 'in'),
      excluded: stringListAt(area, 'out'),
    };
  });
}

export function readMutationRuns(): MutationRun[] {
  const runs = recordAt(readJsonRecord(policyFile('mutation.json')), 'runs');
  return Object.keys(runs).map((name) => {
    const run = recordAt(runs, name);
    return {
      name,
      config: stringAt(run, 'config'),
      report: stringAt(run, 'report'),
      areas: areasOf(run),
    };
  });
}
