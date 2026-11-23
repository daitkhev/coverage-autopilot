import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { z } from 'zod';

import { readCopyFile } from '#infrastructure/files/copy-file';

/** Whether the copy has an entry of that name at its root, of any kind. */
export function hasFile(root: string, name: string): boolean {
  return existsSync(join(root, name));
}

/**
 * The text of a file at the root of the copy, or `null` for one that is
 * missing or that the reader of a copy refuses, such as a link.
 */
export function readText(root: string, name: string): string | null {
  const read = readCopyFile(root, join(root, name));
  return read.outcome === 'read' ? read.text : null;
}

/** `null` for a text that is not JSON of this shape. */
export function parseJson<Schema extends z.ZodType>(
  text: string,
  schema: Schema,
): z.infer<Schema> | null {
  try {
    return schema.parse(JSON.parse(text));
  } catch {
    return null;
  }
}

/** `null` for a file that is not JSON of this shape, or is not read at all. */
export function readJson<Schema extends z.ZodType>(
  root: string,
  name: string,
  schema: Schema,
): z.infer<Schema> | null {
  const text = readText(root, name);
  return text === null ? null : parseJson(text, schema);
}
