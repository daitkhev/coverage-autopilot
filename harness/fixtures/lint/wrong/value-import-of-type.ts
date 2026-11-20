import { Stats } from 'node:fs';

export function sizeOf(stats: Stats): number {
  return stats.size;
}
