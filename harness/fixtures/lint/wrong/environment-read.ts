import * as everything from 'node:process';
import byDefault from 'node:process';
import { env } from 'node:process';

import { env as renamed } from 'process';

const { env: apart } = process;

export function homes(): (string | undefined)[] {
  return [
    process.env['HOME'],
    globalThis.process.env['HOME'],
    apart['HOME'],
    env['HOME'],
    renamed['HOME'],
    byDefault.argv[0],
    everything.argv[0],
  ];
}

export function homesByText(): (string | undefined)[] {
  return [process['env']['HOME'], globalThis.process['env']['HOME']];
}
