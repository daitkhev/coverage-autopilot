import { spawnSync } from 'node:child_process';

import ts from 'typescript';

export const steps = [spawnSync, ts];
