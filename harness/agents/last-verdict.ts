import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { readJsonRecord, stringAt } from '#harness/shared/json';

/** Where the verdict is kept. Git ignores the folder. */
export const LAST_VERDICT = 'reports/gate/last-verdict.json';

/** The last verdict of the full gate, and the tree it was given to. */
export interface LastVerdict {
  /** The fingerprint of the tree that was judged. */
  readonly tree: string;
  /** The step that was red. A tree that passed has none. */
  readonly redStep: string | undefined;
}

/** A verdict that is absent or cannot be read is no verdict. */
export function readLastVerdict(root: string): LastVerdict | undefined {
  try {
    const record = readJsonRecord(join(root, LAST_VERDICT));
    const step = record['redStep'];
    return {
      tree: stringAt(record, 'tree'),
      redStep: typeof step === 'string' ? step : undefined,
    };
  } catch {
    return undefined;
  }
}

export function writeLastVerdict(root: string, verdict: LastVerdict): void {
  const path = join(root, LAST_VERDICT);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(verdict)}\n`);
}
