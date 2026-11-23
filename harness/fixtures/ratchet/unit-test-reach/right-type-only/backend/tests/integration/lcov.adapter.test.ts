import { readFileSync } from 'node:fs';

import { lcov } from '#coverage/infrastructure/lcov.adapter';

export const tested = [readFileSync, lcov];
