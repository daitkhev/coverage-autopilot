import { existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  APPLY,
  NEW_TESTS,
  NO_RATE,
  OLD_TESTS,
  TARGET,
} from '#tests/support/mutation-reports';
import { lockfileOf } from '#tests/support/project-folder';
import type { CommitFiles } from '#tests/support/temporary-code-host';

/** The repository of the journey on the code host. */
export const WIDGETS_NAME = 'acme/widgets';

/** A source file the tests of the commit run whole. */
export const COVERED = 'src/percent.ts';

/** The target. Its throw runs only for a rate above one, which no test asks. */
const PRICE = [
  'export function discount(price: number, rate: number): number {',
  '  if (rate > 1) {',
  "    throw new RangeError('rate above one');",
  '  }',
  '  return price - price * rate;',
  '}',
  '',
].join('\n');

/** The lines of the target that Istanbul counts something on. */
const PRICE_LINES = { declaration: 1, condition: 2, refusal: 3, discount: 5 };

const PERCENT =
  'export const percent = (part: number, whole: number): number =>\n' +
  '  (part * 100) / whole;\n';

/** The tests are named as the mutation reports of the target name them. */
const OLD_TEST_FILE = [
  "import { discount } from '../src/price';",
  "import { percent } from '../src/percent';",
  '',
  `test('${APPLY}', () => {`,
  '  expect(discount(100, 0.2)).toBe(80);',
  '});',
  '',
  `test('${NO_RATE}', () => {`,
  '  expect(discount(100, 0)).toBe(100);',
  '});',
  '',
  "test('percent should divide by the whole', () => {",
  '  expect(percent(1, 4)).toBe(25);',
  '});',
  '',
].join('\n');

/**
 * One npm package tested with Jest, as the detector of the service finds
 * it: a manifest, a lockfile that locks the runner, a configuration of
 * the compiler, two sources and one test file. Installed packages are
 * kept out of git, as in any such project.
 */
export const WIDGETS_FILES: CommitFiles = {
  '.gitignore': 'node_modules/\n',
  'package.json': JSON.stringify({
    name: 'widgets',
    scripts: { test: 'jest' },
    devDependencies: { jest: '^30.5.2', typescript: '^6.0.3' },
  }),
  'package-lock.json': lockfileOf({ jest: '30.5.2', typescript: '6.0.3' }),
  'tsconfig.json': JSON.stringify({ compilerOptions: { strict: true } }),
  [TARGET]: PRICE,
  [COVERED]: PERCENT,
  [OLD_TESTS]: OLD_TEST_FILE,
};

/** Whether the test file of the generator is in the copy at `root`. */
function holdsNewTests(root: string): boolean {
  return existsSync(join(root, NEW_TESTS));
}

type Hits = readonly (readonly [line: number, hits: number])[];

/** How often each statement, function and path of a branch ran. */
interface Counts {
  readonly statements: Hits;
  readonly functions: Hits;
  readonly branches: readonly (readonly [line: number, paths: number[]])[];
}

function spanAt(line: number): object {
  return { start: { line, column: 0 }, end: { line, column: 1 } };
}

function keyed<Item, Value>(
  items: readonly Item[],
  value: (item: Item) => Value,
): Record<string, Value> {
  return Object.fromEntries(
    items.map((item, index) => [String(index), value(item)]),
  );
}

/** One file of the `json` report of Istanbul, with the fields it reads. */
function istanbulFile(path: string, counts: Counts): object {
  return {
    path,
    statementMap: keyed(counts.statements, ([line]) => spanAt(line)),
    s: keyed(counts.statements, ([, hits]) => hits),
    fnMap: keyed(counts.functions, ([line]) => ({
      name: `line ${String(line)}`,
      decl: spanAt(line),
      loc: spanAt(line),
    })),
    f: keyed(counts.functions, ([, hits]) => hits),
    branchMap: keyed(counts.branches, ([line]) => ({
      type: 'if',
      loc: spanAt(line),
    })),
    b: keyed(counts.branches, ([, paths]) => paths),
  };
}

function priceCounts(root: string): Counts {
  const refused = holdsNewTests(root) ? 1 : 0;
  const { declaration, condition, refusal, discount } = PRICE_LINES;
  return {
    statements: [
      [condition, 1 + refused],
      [refusal, refused],
      [discount, 1],
    ],
    functions: [[declaration, 1 + refused]],
    branches: [[condition, [refused, 1]]],
  };
}

const PERCENT_COUNTS: Counts = {
  statements: [[1, 1]],
  functions: [[1, 1]],
  branches: [],
};

/**
 * The report Jest writes for the copy at `root`, keyed by absolute paths
 * as a runner names them. The target is below the threshold of lines
 * until the new test file is in the copy, and covered whole with it.
 */
export function coverageReportOf(root: string): string {
  const fileAt = (path: string, counts: Counts): [string, object] => [
    join(root, path),
    istanbulFile(join(root, path), counts),
  ];
  return JSON.stringify(
    Object.fromEntries([
      fileAt(TARGET, priceCounts(root)),
      fileAt(COVERED, PERCENT_COUNTS),
    ]),
  );
}
