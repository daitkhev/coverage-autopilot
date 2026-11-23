/*
 * Reports in the format of mutation-testing-report-schema, as the `json`
 * reporter of StrykerJS 10 writes them, written by hand for one target:
 * `src/price.ts`. Files and test files are keyed by their paths relative
 * to the working copy, and a line and a column count from 1.
 */

export const TARGET = 'src/price.ts';

const SOURCE = [
  'export function discount(price: number, rate: number): number {',
  '  if (rate > 1) {',
  "    throw new RangeError('rate above one');",
  '  }',
  '  return price - price * rate;',
  '}',
  '',
].join('\n');

export const OLD_TESTS = 'tests/price.test.ts';

/** The test file a patch adds. */
export const NEW_TESTS = 'tests/price-limit.test.ts';

export const APPLY = 'discount should apply the rate';
export const NO_RATE = 'discount should leave a price without a rate';
export const REFUSE = 'discount when the rate is above one should refuse it';
export const MESSAGE = 'discount when the rate is above one should say why';

/** The line of the first test in its file. */
const FIRST_TEST_LINE = 3;

export interface MutantSpec {
  readonly id: string;
  readonly mutatorName: string;
  readonly replacement: string;
  /** Where the mutant is, as `line:column-line:column`. */
  readonly at: string;
  readonly status:
    | 'Killed'
    | 'Survived'
    | 'NoCoverage'
    | 'CompileError'
    | 'RuntimeError'
    | 'Timeout'
    | 'Ignored'
    | 'Pending';
  readonly statusReason?: string;
  readonly killedBy?: readonly string[];
  readonly coveredBy?: readonly string[];
}

export interface ReportSpec {
  readonly mutants: readonly MutantSpec[];
  /** The tests of each test file, each as its id and its full name. */
  readonly tests: Readonly<Record<string, readonly (readonly string[])[]>>;
  /** Where StrykerJS ran: the working copy, by an absolute path. */
  readonly projectRoot: string;
}

function positionOf(text: string): object {
  const [line, column] = text.split(':').map(Number);
  return { line, column };
}

function mutantOf(spec: MutantSpec): object {
  const { at, ...rest } = spec;
  const [start = '', end = ''] = at.split('-');
  return {
    ...rest,
    location: { start: positionOf(start), end: positionOf(end) },
    static: false,
  };
}

function testFileOf(tests: readonly (readonly string[])[]): object {
  return {
    source: "import { discount } from '../src/price';\n",
    tests: tests.map(([id, name], index) => ({
      id,
      name,
      location: { start: { line: index + FIRST_TEST_LINE, column: 1 } },
    })),
  };
}

/** The whole report, with the fields StrykerJS adds and nothing reads. */
export function reportOf(spec: ReportSpec): string {
  const testFiles = Object.fromEntries(
    Object.entries(spec.tests).map(([file, tests]) => [
      file,
      testFileOf(tests),
    ]),
  );
  return JSON.stringify({
    schemaVersion: '1.0',
    thresholds: { high: 80, low: 60, break: null },
    files: {
      [TARGET]: {
        language: 'typescript',
        source: SOURCE,
        mutants: spec.mutants.map(mutantOf),
      },
    },
    testFiles,
    projectRoot: spec.projectRoot,
    config: { incrementalFile: `${spec.projectRoot}/cache.json` },
    framework: { name: 'StrykerJS', version: '10.1.1' },
  });
}

/** Every status but `Pending`, out of order, as the tool may list them. */
const MUTANTS: readonly MutantSpec[] = [
  {
    id: '6',
    mutatorName: 'ArithmeticOperator',
    replacement: 'price + price * rate',
    at: '5:10-5:30',
    status: 'Killed',
  },
  {
    id: '1',
    mutatorName: 'BlockStatement',
    replacement: '{}',
    at: '1:63-6:2',
    status: 'Killed',
  },
  {
    id: '4',
    mutatorName: 'EqualityOperator',
    replacement: 'rate >= 1',
    at: '2:7-2:15',
    status: 'Survived',
  },
  {
    id: '3',
    mutatorName: 'ConditionalExpression',
    replacement: 'false',
    at: '2:7-2:15',
    status: 'Survived',
  },
  {
    id: '2',
    mutatorName: 'ConditionalExpression',
    replacement: 'true',
    at: '2:7-2:15',
    status: 'Killed',
  },
  {
    id: '5',
    mutatorName: 'StringLiteral',
    replacement: '""',
    at: '3:26-3:42',
    status: 'NoCoverage',
    coveredBy: [],
  },
  {
    id: '9',
    mutatorName: 'StringLiteral',
    replacement: '"Stryker was here!"',
    at: '3:26-3:42',
    status: 'Ignored',
    statusReason: 'Ignored by a disable comment',
  },
  {
    id: '7',
    mutatorName: 'ArithmeticOperator',
    replacement: 'price / rate',
    at: '5:18-5:30',
    status: 'Timeout',
    statusReason: 'Hit limit reached (5012/5000)',
  },
  {
    id: '8',
    mutatorName: 'BlockStatement',
    replacement: '{}',
    at: '2:17-4:4',
    status: 'CompileError',
    statusReason: 'error TS2366: Function lacks ending return statement.',
  },
  {
    id: '10',
    mutatorName: 'ArithmeticOperator',
    replacement: 'price - price / rate',
    at: '5:10-5:30',
    status: 'RuntimeError',
    statusReason: 'TypeError: rate is not a number',
  },
];

/** The mutants of `MUTANTS`, each with what a run found for it. */
function mutantsWith(
  outcomes: Readonly<Record<string, Partial<MutantSpec>>>,
): MutantSpec[] {
  return MUTANTS.map((mutant) => ({ ...mutant, ...outcomes[mutant.id] }));
}

/** The commit: one test file, whose tests are `0` and `1`. */
export function baselineReport(projectRoot: string): string {
  return reportOf({
    projectRoot,
    tests: {
      [OLD_TESTS]: [
        ['0', APPLY],
        ['1', NO_RATE],
      ],
    },
    mutants: mutantsWith({
      '6': { killedBy: ['0'], coveredBy: ['0', '1'] },
      '1': { killedBy: ['0', '1'], coveredBy: ['0', '1'] },
      '4': { coveredBy: ['0', '1'] },
      '3': { coveredBy: ['0', '1'] },
      '2': { killedBy: ['0'], coveredBy: ['0', '1'] },
      '7': { coveredBy: ['0'] },
    }),
  });
}

/**
 * The commit with the new test file. The tool lists the new tests first,
 * so they are `0` and `1`, and the tests of the commit became `2` and `3`.
 */
export function patchedReport(projectRoot: string): string {
  const all = ['0', '1', '2', '3'];
  return reportOf({
    projectRoot,
    tests: {
      [NEW_TESTS]: [
        ['0', REFUSE],
        ['1', MESSAGE],
      ],
      [OLD_TESTS]: [
        ['2', APPLY],
        ['3', NO_RATE],
      ],
    },
    mutants: mutantsWith({
      '6': { killedBy: ['2'], coveredBy: ['2', '3'] },
      '1': { killedBy: ['2', '3'], coveredBy: all },
      '4': { coveredBy: all },
      '3': { status: 'Killed', killedBy: ['0', '1'], coveredBy: all },
      '2': { killedBy: ['2', '3'], coveredBy: all },
      '5': { status: 'Killed', killedBy: ['1'], coveredBy: ['0', '1'] },
      '7': { coveredBy: ['0', '2'] },
    }),
  });
}

/** Every mutant the tool does not ignore, by its id. */
const LISTED = ['1', '2', '3', '4', '5', '6', '7', '8', '10'];

/**
 * A run that only lists the mutants: a command that passes runs in place
 * of a runner, under no test file, so every mutant survived it.
 */
export function listingReport(projectRoot: string): string {
  const survived = Object.fromEntries(
    LISTED.map((id) => [id, { status: 'Survived' as const }]),
  );
  return reportOf({
    projectRoot,
    tests: { '': [['all', 'All tests']] },
    mutants: mutantsWith(survived),
  });
}
