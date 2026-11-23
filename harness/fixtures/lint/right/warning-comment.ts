// An empty list has no first item, so the answer can be undefined.
export function first(items: readonly string[]): string | undefined {
  return items[0];
}
