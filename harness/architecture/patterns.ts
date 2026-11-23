const SPECIAL = /[.+?^${}()|[\]\\]/g;

/**
 * Whether a path is in a place. A place that ends with a slash is a folder
 * and everything under it. Any other place is one file. `*` stands for one
 * name, or for part of one.
 */
export function isInPlace(path: string, place: string): boolean {
  const escaped = place.replace(SPECIAL, '\\$&').replaceAll('*', '[^/]*');
  const end = place.endsWith('/') ? '' : '$';
  return new RegExp(`^${escaped}${end}`).test(path);
}

export function isInSomePlace(
  path: string,
  places: readonly string[],
): boolean {
  return places.some((place) => isInPlace(path, place));
}
