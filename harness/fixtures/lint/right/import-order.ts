import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function read(folder: string): string {
  return readFileSync(join(folder, 'a.txt'), 'utf8');
}
