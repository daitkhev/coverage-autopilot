import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { sep } from 'node:path';

const BYTES_IN_A_MEGABYTE = 1_048_576;
const MEGABYTES = 64;

/**
 * No file the service reads from a working copy is near this size: the
 * coverage report of a large project is a few megabytes.
 */
const COPY_FILE_BYTES = MEGABYTES * BYTES_IN_A_MEGABYTE;

type Refusal = 'not_a_plain_file' | 'outside_the_copy' | 'too_large';

export const REFUSAL_WORDS: Readonly<Record<Refusal, string>> = {
  not_a_plain_file: 'it is not a plain file',
  outside_the_copy: 'it leads out of the working copy',
  too_large: 'it is larger than any file the service reads',
};

export type CopyFileRead =
  | { readonly outcome: 'read'; readonly text: string }
  | { readonly outcome: 'missing' }
  | { readonly outcome: 'refused'; readonly reason: Refusal };

function isInside(root: string, path: string): boolean {
  return realpathSync(path).startsWith(`${realpathSync(root)}${sep}`);
}

/**
 * Reads one file of a working copy as text. Code of the repository may
 * have written anything into the copy, and the service reads it on the
 * host, so a link, a file reached through a linked folder and a file of
 * no end, such as a link to a device, are refused before a byte is read.
 */
export function readCopyFile(
  root: string,
  path: string,
  maxBytes: number = COPY_FILE_BYTES,
): CopyFileRead {
  const entry = lstatSync(path, { throwIfNoEntry: false });
  if (entry === undefined) {
    return { outcome: 'missing' };
  }
  if (!entry.isFile()) {
    return { outcome: 'refused', reason: 'not_a_plain_file' };
  }
  if (!isInside(root, path)) {
    return { outcome: 'refused', reason: 'outside_the_copy' };
  }
  if (entry.size > maxBytes) {
    return { outcome: 'refused', reason: 'too_large' };
  }
  return { outcome: 'read', text: readFileSync(path, 'utf8') };
}
