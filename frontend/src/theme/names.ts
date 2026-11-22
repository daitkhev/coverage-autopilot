/** A commit or a patch is named by its first seven characters, as git does. */
const SHORT_HASH = 7;

/** A commit or a patch as short as git prints it: `4f2a9c1`. */
export function shortHash(hash: string): string {
  return hash.slice(0, SHORT_HASH);
}
