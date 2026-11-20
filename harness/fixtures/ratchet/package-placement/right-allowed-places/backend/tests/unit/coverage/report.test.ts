import { tmpdir } from 'node:os';

import { describe } from '@jest/globals';

export const subject = [tmpdir, describe];
