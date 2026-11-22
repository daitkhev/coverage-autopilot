/**
 * A percentage with one decimal, as `41.2%`. The service sends it, so it
 * is only written here, never computed.
 */
export function percentWords(percentage: number): string {
  return `${percentage.toFixed(1)}%`;
}

/** Covered of the total, as `12/30`. */
export function ratioWords(covered: number, total: number): string {
  return `${String(covered)}/${String(total)}`;
}

/**
 * A count with its noun, as `1 file` and `3 files`. A noun whose plural
 * is not its singular with an `s` names it: `5 repositories`.
 */
export function countWords(
  count: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return `${String(count)} ${count === 1 ? singular : plural}`;
}
