import { join } from 'node:path';
import { readFileSync } from 'node:fs';

export function read(folder: string): string {
  return readFileSync(join(folder, 'a.txt'), 'utf8');
}
