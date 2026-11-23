import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TOOLS } from '#harness/gate/tools';
import { isRecord } from '#harness/shared/json';
import { HARNESS_ROOT, REPOSITORY_ROOT } from '#harness/shared/policy';

const PROJECTS = join(HARNESS_ROOT, 'fixtures', 'projects');
const EVERY_SOURCE_FILE = 'src/**/*.ts';
const SUMMARY = 'coverage-summary.json';

/** Statements of each file in a report, as `covered/total`, by short path. */
type Statements = Record<string, string>;

interface Run {
  readonly exit: number | null;
  readonly log: string;
  readonly statements: Statements;
}

const output = mkdtempSync(join(tmpdir(), 'harness-runners-'));

function statementsIn(folder: string): Statements {
  const path = join(folder, SUMMARY);
  const parsed: unknown = existsSync(path)
    ? JSON.parse(readFileSync(path, 'utf8'))
    : {};
  const entries = isRecord(parsed) ? Object.entries(parsed) : [];
  return Object.fromEntries(
    entries.flatMap(([file, counters]) => {
      const counter = isRecord(counters) ? counters['statements'] : undefined;
      const at = file.lastIndexOf('src/');
      return isRecord(counter) && at >= 0
        ? [
            [
              file.slice(at),
              `${String(counter['covered'])}/${String(counter['total'])}`,
            ],
          ]
        : [];
    }),
  );
}

function run(project: string, script: string, args: string[]): Run {
  const result = spawnSync(
    process.execPath,
    [join(REPOSITORY_ROOT, script), ...args],
    { cwd: join(PROJECTS, project), encoding: 'utf8' },
  );
  const folder = args.at(-1) ?? '';
  return {
    exit: result.status,
    log: `${result.stdout}${result.stderr}`,
    statements: statementsIn(folder.slice(folder.indexOf('=') + 1)),
  };
}

function jest(name: string, ...more: string[]): Run {
  return run('jest', TOOLS.jest, [
    '--config',
    'jest.config.json',
    '--ci',
    '--coverage',
    '--coverageProvider',
    'babel',
    '--coverageReporters',
    'json-summary',
    ...more,
    `--coverageDirectory=${join(output, name)}`,
  ]);
}

function vitest(name: string, ...more: string[]): Run {
  return run('vitest', TOOLS.vitest, [
    'run',
    '--coverage',
    '--coverage.provider=v8',
    '--coverage.reporter=json-summary',
    ...more,
    `--coverage.reportsDirectory=${join(output, name)}`,
  ]);
}

afterAll(() => {
  rmSync(output, { recursive: true, force: true });
});

interface Runner {
  readonly name: string;
  /** Runs the project with every source file listed for coverage. */
  readonly listed: (name: string) => Run;
  /** Runs the project as it is, with no list. */
  readonly bare: (name: string) => Run;
  /** Statements of `src/used.ts`: one of its two functions is called. */
  readonly used: string;
  /** What the report has for a file of types alone. */
  readonly types: string | undefined;
  /** What the log says about a file that cannot be parsed. */
  readonly cannotParse: RegExp;
}

const RUNNERS: Runner[] = [
  {
    name: 'Jest',
    listed: (name) => jest(name, '--collectCoverageFrom', EVERY_SOURCE_FILE),
    bare: (name) => jest(name),
    used: '2/6',
    types: undefined,
    cannotParse: /Failed to collect coverage from .*broken\.ts/,
  },
  {
    name: 'Vitest',
    listed: (name) => vitest(name, `--coverage.include=${EVERY_SOURCE_FILE}`),
    bare: (name) => vitest(name),
    used: '1/4',
    types: '0/0',
    cannotParse: /Failed to parse .*broken\.ts/,
  },
];

describe.each(RUNNERS)('$name on its fixture project', (runner) => {
  let listed: Run;
  let bare: Run;

  beforeAll(() => {
    listed = runner.listed(`${runner.name}-listed`);
    bare = runner.bare(`${runner.name}-bare`);
  }, 120_000);

  it('should pass the tests of the project', () => {
    expect(listed.exit).toBe(0);
    expect(bare.exit).toBe(0);
  });

  it('should report only imported files when it is given no list', () => {
    expect(Object.keys(bare.statements)).toEqual(['src/used.ts']);
  });

  it('should list a file that no test imports at zero, given the list', () => {
    expect(listed.statements['src/unused.ts']).toBe('0/1');
    expect(listed.statements['src/used.ts']).toBe(runner.used);
  });

  it('should have nothing to cover in a file of types alone', () => {
    expect(listed.statements['src/types.ts']).toBe(runner.types);
  });

  it('should drop a file it cannot parse, say so, and still pass', () => {
    expect(listed.statements['src/broken.ts']).toBeUndefined();
    expect(listed.log).toMatch(runner.cannotParse);
  });
});

describe('the two runners side by side', () => {
  it('should count one file differently, so numbers stay in one project', () => {
    const [first, second] = RUNNERS.map((runner) => runner.used);

    expect(first).not.toBe(second);
  });
});
