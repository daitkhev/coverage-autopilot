import type { ImprovementPatch } from '@coverage-autopilot/api-contracts/improvements';

import { PATCH_AWAITING_APPROVAL } from '#tests/support/sample-improvements';

/** More lines than any terminal shows at once, so the patch scrolls. */
const LONG_LINES = 40;

/** The hash of a patch that replaced the one on the screen. */
const NEWER_HASH =
  '4b7d21e000000000000000000000000000000000000000000000000000000000';

function testFile(path: string, lines: readonly string[]): string[] {
  return [
    `diff --git a/${path} b/${path}`,
    'new file mode 100644',
    '--- /dev/null',
    `+++ b/${path}`,
    `@@ -0,0 +1,${String(lines.length)} @@`,
    ...lines.map((line) => `+${line}`),
  ];
}

const CASES = Array.from(
  { length: LONG_LINES },
  (_, at) => `it('should keep case ${String(at + 1)}', () => undefined);`,
);

/** A patch of one test file with many cases, which scrolls. */
export const LONG_PATCH: ImprovementPatch = {
  ...PATCH_AWAITING_APPROVAL,
  patch: `${testFile('src/billing/sum.test.ts', CASES).join('\n')}\n`,
};

/** A test file and a fixture beside it, and a line the patch takes out. */
export const TWO_FILE_PATCH: ImprovementPatch = {
  ...PATCH_AWAITING_APPROVAL,
  patch: [
    ...testFile('src/billing/sum.test.ts', [
      "it('should sum', () => undefined);",
    ]),
    'diff --git a/src/billing/fixtures.ts b/src/billing/fixtures.ts',
    '--- a/src/billing/fixtures.ts',
    '+++ b/src/billing/fixtures.ts',
    '@@ -1,1 +1,1 @@',
    '-export const RATE = 0.1;',
    '+export const RATE = 0.2;',
    '',
  ].join('\n'),
};

/** The patch of the improvement after it changed on the service. */
export const NEWER_PATCH: ImprovementPatch = {
  ...PATCH_AWAITING_APPROVAL,
  patchHash: NEWER_HASH,
};
