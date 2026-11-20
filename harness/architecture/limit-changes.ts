import type { Finding } from '#harness/architecture/finding';
import { isRecord, type JsonRecord } from '#harness/shared/json';

/** Where the limits are, from the root of the tree. */
export const LIMITS = 'harness/policy/limits.json';

/** Numbers that may only go down. */
const CEILINGS = ['function.', 'file.', 'duplication.'];
/** Numbers that may only go up. */
const FLOORS = ['coverage.', 'mutation.'];
const IGNORED = ['schema'];

function numbersIn(record: JsonRecord, prefix = ''): Map<string, number> {
  const numbers = new Map<string, number>();
  for (const [key, value] of Object.entries(record)) {
    const name = `${prefix}${key}`;
    if (typeof value === 'number' && !IGNORED.includes(name)) {
      numbers.set(name, value);
    }
    if (isRecord(value)) {
      for (const [inner, number] of numbersIn(value, `${name}.`)) {
        numbers.set(inner, number);
      }
    }
  }
  return numbers;
}

function startsWithOneOf(name: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => name.startsWith(prefix));
}

function problemOf(
  name: string,
  before: number | undefined,
  now: number | undefined,
): string {
  const ceiling = startsWithOneOf(name, CEILINGS);
  if (!ceiling && !startsWithOneOf(name, FLOORS)) {
    return `"${name}" is not known as a ceiling or as a floor.`;
  }
  if (before === undefined) {
    return '';
  }
  if (now === undefined) {
    return `"${name}" was removed.`;
  }
  const looser = ceiling ? now > before : now < before;
  const change = `from ${String(before)} to ${String(now)}`;
  return looser
    ? `"${name}" went ${ceiling ? 'up' : 'down'} ${change}. It moves one way.`
    : '';
}

/** The numbers of the limits that became looser than they were. */
export function limitFindings(
  base: JsonRecord,
  current: JsonRecord,
): Finding[] {
  const before = numbersIn(base);
  const now = numbersIn(current);
  const names = [...new Set([...before.keys(), ...now.keys()])].sort();
  return names.flatMap((name) => {
    const detail = problemOf(name, before.get(name), now.get(name));
    return detail === ''
      ? []
      : [{ rule: 'limit-loosened', path: LIMITS, line: 1, detail }];
  });
}
