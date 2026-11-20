import { readFileSync } from 'node:fs';

import ts from 'typescript';

import { b } from '#harness/b';

export const a = [readFileSync, ts, b];
