import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runRatchetCommand } from '#harness/architecture/ratchet-command';
import type { NodeCommand } from '#harness/gate/host';
import { runCoverage } from '#harness/gate/run-coverage';
import { runDocuments } from '#harness/gate/run-documents';
import {
  duplicationCommand,
  runDuplication,
} from '#harness/gate/run-duplication';
import { runTypes } from '#harness/gate/run-types';
import { readLimits, REPOSITORY_ROOT } from '#harness/shared/policy';
import { type FakeHost, fakeHost } from '#harness/tests/support/fake-host';
import {
  type TemporaryRepository,
  temporaryRepository,
} from '#harness/tests/support/temporary-repository';

let repository: TemporaryRepository;
let host: FakeHost;

beforeEach(() => {
  repository = temporaryRepository();
  host = fakeHost({ root: repository.root });
});

afterEach(() => {
  repository.dispose();
});

describe('runRatchetCommand', () => {
  it('should check the tree of the host and fail on a finding', () => {
    expect(runRatchetCommand([], host)).toBe(1);
    expect(host.printed).toEqual([
      'harness/baseline.json:1 baseline There is no baseline. ' +
        'Record it with `npm run ratchet:write`.',
      'ratchet: 1 finding(s)',
    ]);
  });

  it('should write the baseline, and then pass', () => {
    expect(runRatchetCommand(['--write'], host)).toBe(0);
    expect(runRatchetCommand([], host)).toBe(0);
    expect(host.printed).toEqual([
      'ratchet: harness/baseline.json was written.',
      'ratchet: no finding',
      'ratchet: no finding',
    ]);
  });

  it('should work on another tree when it is given a root', () => {
    const other = fakeHost({ root: REPOSITORY_ROOT });

    expect(runRatchetCommand(['--root', repository.root], other)).toBe(1);
  });

  it('should compare with a base', () => {
    const base = repository.commit();

    expect(runRatchetCommand(['--compare', base], host)).toBe(0);
    expect(host.printed.at(-1)).toBe('ratchet: no finding');
  });

  it('should fail in one line when the base is not a commit', () => {
    repository.commit();

    expect(runRatchetCommand(['--compare', 'no-such-branch'], host)).toBe(1);
    expect(host.printed).toEqual([
      '"no-such-branch" is not a commit of this repository.',
    ]);
  });
});

describe('runTypes', () => {
  it('should run the root and name the workspaces with no source', () => {
    const here = fakeHost({ root: REPOSITORY_ROOT });

    expect(runTypes(here)).toBe(0);
    expect(here.started.map((command) => command.arguments.at(-1))).toContain(
      'tsconfig.json',
    );
    expect(here.printed[0]).toBe('types: root passed');
  });
});

describe('runDuplication', () => {
  it('should give jscpd its configuration and the ceiling', () => {
    expect(duplicationCommand(0.5)).toEqual({
      nodeOptions: [],
      script: 'node_modules/jscpd/run-jscpd.js',
      arguments: [
        '.',
        '--config',
        'harness/configs/jscpd.json',
        '--threshold',
        '0.5',
        '--fail-on-empty',
        '--no-colors',
      ],
    });
  });

  it('should hold duplication at the ceiling of the policy', () => {
    expect(runDuplication(host)).toBe(0);
    expect(host.started).toEqual([
      duplicationCommand(readLimits().duplicationPercent),
    ]);
  });

  it('should fail when jscpd fails', () => {
    const above = fakeHost({ root: repository.root, passes: () => false });

    expect(runDuplication(above)).toBe(1);
  });
});

describe('runCoverage', () => {
  const REPORT = 'coverage/harness/coverage-final.json';
  const NOT_YET = [
    'coverage: api-contracts has no source yet',
    'coverage: backend has no source yet',
    'coverage: frontend has no source yet',
  ];

  function report(...paths: string[]): string {
    const entries = paths.map((path) => [`${repository.root}/${path}`, {}]);
    return JSON.stringify(Object.fromEntries(entries));
  }

  /** The area a started Vitest measures: the folder of its report. */
  function areaOf(command: NodeCommand): string {
    const option = '--coverage.reportsDirectory=coverage/';
    const folder = command.arguments.find((word) => word.startsWith(option));
    return (folder ?? option).slice(option.length);
  }

  /** A host whose Vitest passes and leaves the report of each area behind. */
  function hostWriting(reports: Readonly<Record<string, string>>): FakeHost {
    return fakeHost({
      root: repository.root,
      passes: (command) => {
        const area = areaOf(command);
        repository.write(
          `coverage/${area}/coverage-final.json`,
          reports[area] ?? '{}',
        );
        return true;
      },
    });
  }

  beforeEach(() => {
    repository.write('harness/gate/steps.ts', 'export const steps = 1;\n');
    repository.write('harness/gate/step.ts', 'export interface Step {}\n');
    repository.write('harness/tests/unit/steps.test.ts', 'export {};\n');
  });

  it('should pass when the report has every file that runs something', () => {
    const vitest = hostWriting({ harness: report('harness/gate/steps.ts') });

    expect(runCoverage(vitest)).toBe(0);
    expect(vitest.printed).toEqual([
      'coverage: harness: every source file is in the report',
      ...NOT_YET,
    ]);
  });

  it('should not ask for a file that git knows and that is gone', () => {
    repository.write('harness/gate/gone.ts', 'export const a = 1;\n');
    repository.commit();
    repository.remove('harness/gate/gone.ts');
    const vitest = hostWriting({ harness: report('harness/gate/steps.ts') });

    expect(runCoverage(vitest)).toBe(0);
  });

  it('should fail when a source file is not in the report', () => {
    repository.write('harness/gate/left-out.ts', 'export const a = 1;\n');
    const vitest = hostWriting({ harness: report('harness/gate/steps.ts') });

    expect(runCoverage(vitest)).toBe(1);
    expect(vitest.printed).toEqual([
      'coverage: harness/gate/left-out.ts is not in the report.',
      'coverage: harness: 1 file(s) left out',
    ]);
  });

  it('should fail and read no report when Vitest fails', () => {
    const vitest = fakeHost({ root: repository.root, passes: () => false });

    expect(runCoverage(vitest)).toBe(1);
    expect(vitest.printed).toEqual([]);
  });

  it('should not trust a report that an earlier run left behind', () => {
    repository.write(REPORT, report('harness/gate/steps.ts'));

    expect(runCoverage(host)).toBe(1);
    expect(host.printed).toEqual([`coverage: ${REPORT} was not written.`]);
  });

  it('should measure a workspace from the moment it holds code that runs', () => {
    repository.write('backend/src/main.ts', 'export const a = 1;\n');
    repository.write('backend/src/a.dto.ts', 'export interface A {}\n');
    repository.write('frontend/src/app/a.ts', 'export type A = 1;\n');
    const vitest = hostWriting({
      harness: report('harness/gate/steps.ts'),
      backend: report('backend/src/main.ts'),
    });

    expect(runCoverage(vitest)).toBe(0);
    expect(vitest.started.map(areaOf)).toEqual(['harness', 'backend']);
    expect(vitest.printed).toEqual([
      'coverage: harness: every source file is in the report',
      'coverage: api-contracts has no source yet',
      'coverage: backend: every source file is in the report',
      'coverage: frontend has no source yet',
    ]);
  });

  it('should hold each area by its own tests, and stop at the first red one', () => {
    repository.write('backend/src/main.ts', 'export const a = 1;\n');
    repository.write('frontend/src/main.tsx', 'export const a = 1;\n');
    const vitest = fakeHost({
      root: repository.root,
      passes: (command) => {
        repository.write(REPORT, report('harness/gate/steps.ts'));
        return areaOf(command) !== 'backend';
      },
    });

    expect(runCoverage(vitest)).toBe(1);
    expect(vitest.started.map(areaOf)).toEqual(['harness', 'backend']);
    expect(vitest.started[1]?.arguments.slice(-2)).toEqual([
      'backend/tests/unit',
      'backend/tests/integration',
    ]);
  });

  it('should not take the report of one area for the report of another', () => {
    repository.write('backend/src/main.ts', 'export const a = 1;\n');
    const vitest = hostWriting({
      harness: report('harness/gate/steps.ts', 'backend/src/main.ts'),
    });

    expect(runCoverage(vitest)).toBe(1);
    expect(vitest.printed.slice(-2)).toEqual([
      'coverage: backend/src/main.ts is not in the report.',
      'coverage: backend: 1 file(s) left out',
    ]);
  });
});

describe('runDocuments', () => {
  it('should lint the documents git sees, each by its own path', () => {
    repository.write('README.md', '# Title\n');
    repository.write('docs/plan/a.md', '# A\n');
    repository.write('harness/fixtures/lint/notes.md', '# Notes\n');
    repository.write('.gitignore', 'private.md\n');
    repository.write('private.md', '[gone](gone.md)\n');

    expect(runDocuments(host)).toBe(0);
    expect(host.started[0]?.arguments).toEqual([
      '--config',
      'harness/configs/markdownlint.json',
      ':README.md',
      ':docs/plan/a.md',
    ]);
    expect(host.printed).toEqual(['documents: 0 dead link(s)']);
  });

  it('should fail on a link that leads nowhere', () => {
    repository.write('README.md', '# Title\n\nSee [the plan](docs/plan.md).\n');

    expect(runDocuments(host)).toBe(1);
    expect(host.printed).toEqual([
      'README.md:3 dead-link "docs/plan.md" leads to no file.',
      'documents: 1 dead link(s)',
    ]);
  });

  it('should fail when the lint of the documents fails', () => {
    repository.write('README.md', '# Title\n');
    const failing = fakeHost({ root: repository.root, passes: () => false });

    expect(runDocuments(failing)).toBe(1);
  });
});
