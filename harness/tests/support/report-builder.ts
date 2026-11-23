import type { MutationReport } from '#harness/mutation/report';
import type { Area } from '#harness/shared/mutation-policy';

/** A report with the given statuses, file by file. */
export function reportWith(
  statuses: Readonly<Record<string, readonly string[]>>,
): MutationReport {
  return {
    files: Object.keys(statuses),
    mutants: Object.entries(statuses).flatMap(([file, list]) =>
      list.map((status) => ({ file, status })),
    ),
  };
}

/** The area the tests judge: one folder, with one folder inside left out. */
export const RULES: Area = {
  name: 'rules',
  places: ['harness/rules/'],
  excluded: ['harness/rules/tests/'],
};

/** A status repeated, to write many mutants in one line. */
export function times(count: number, status: string): string[] {
  return Array.from({ length: count }, () => status);
}
