import { join } from 'node:path';
import { readFileSync } from 'node:fs';

export const tested = [join, readFileSync];
