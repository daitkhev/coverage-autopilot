import { posix } from 'node:path';

import type { ImportKind } from '#harness/architecture/project';
import { isRecord } from '#harness/shared/json';

/** One entry of the `imports` field of a `package.json`. */
export interface Alias {
  /** What a specifier starts with, such as `#harness/`. */
  readonly prefix: string;
  /** True when the entry has a `*` and so names many files. */
  readonly pattern: boolean;
  /** Path before the `*`, from the root of the measured tree. */
  readonly head: string;
  /** What follows the `*`, usually an extension. */
  readonly tail: string;
}

const WILDCARD = '*';

function aliasOf(key: string, target: string, folder: string): Alias {
  const keyStar = key.indexOf(WILDCARD);
  const targetStar = target.indexOf(WILDCARD);
  const pattern = keyStar >= 0 && targetStar >= 0;
  const whole = posix.join(folder, target);
  const star = whole.indexOf(WILDCARD);
  return {
    prefix: pattern ? key.slice(0, keyStar) : key,
    pattern,
    head: pattern ? whole.slice(0, star) : whole,
    tail: pattern ? whole.slice(star + 1) : '',
  };
}

/**
 * The aliases a `package.json` declares. `folder` is where that file is, from
 * the root of the measured tree, and `''` for the root itself.
 */
export function aliasesOf(manifest: unknown, folder: string): Alias[] {
  const imports = isRecord(manifest) ? manifest['imports'] : undefined;
  if (!isRecord(imports)) {
    return [];
  }
  return Object.entries(imports).flatMap(([key, target]) =>
    typeof target === 'string' ? [aliasOf(key, target, folder)] : [],
  );
}

/** The path an alias specifier names, whether or not a file is there. */
export function resolveAlias(
  specifier: string,
  aliases: readonly Alias[],
): string | undefined {
  for (const alias of aliases) {
    if (alias.pattern && specifier.startsWith(alias.prefix)) {
      const rest = specifier.slice(alias.prefix.length);
      return posix.normalize(`${alias.head}${rest}${alias.tail}`);
    }
    if (!alias.pattern && specifier === alias.prefix) {
      return posix.normalize(alias.head);
    }
  }
  return undefined;
}

export function kindOf(specifier: string): ImportKind {
  if (specifier.startsWith('.')) {
    return 'relative';
  }
  if (specifier.startsWith('#')) {
    return 'alias';
  }
  return specifier.startsWith('node:') ? 'builtin' : 'package';
}
