import { HarnessError } from '#harness/shared/harness.error';
import { isRecord, type JsonRecord } from '#harness/shared/json';

/** One mutant of a report: where it is and how its run ended. */
export interface Mutant {
  readonly file: string;
  readonly status: string;
}

/** What a report of the mutation engine says, reduced to what is judged. */
export interface MutationReport {
  /** Every file the engine looked at, with mutants or without. */
  readonly files: readonly string[];
  readonly mutants: readonly Mutant[];
}

function mutantsOf(file: string, entry: unknown): Mutant[] {
  const mutants = isRecord(entry) ? entry['mutants'] : undefined;
  if (!Array.isArray(mutants)) {
    throw new HarnessError(`The report has no mutants for ${file}.`);
  }
  return mutants.map((mutant: unknown) => {
    const status = isRecord(mutant) ? mutant['status'] : undefined;
    if (typeof status !== 'string') {
      throw new HarnessError(`A mutant of ${file} has no status.`);
    }
    return { file, status };
  });
}

/** Reads a report in the mutation testing report format. */
export function reportOf(parsed: JsonRecord): MutationReport {
  const files = parsed['files'];
  if (!isRecord(files)) {
    throw new HarnessError('The report has no "files".');
  }
  return {
    files: Object.keys(files),
    mutants: Object.entries(files).flatMap(([file, entry]) =>
      mutantsOf(file, entry),
    ),
  };
}
