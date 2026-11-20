import { readFile } from 'node:fs/promises';

import { Logger } from '@nestjs/common';
import { z } from 'zod';

export const adapter = [readFile, Logger, z];
