import { describe, expect, it } from 'vitest';

import type { ImportRecord, Rule } from '#harness/architecture/project';
import { unitTestReach } from '#harness/architecture/rules/unit-test-reach';
import {
  MODULES,
  SHARED,
  structureOf,
} from '#harness/tests/support/policy-builder';
import {
  importFrom,
  importOf,
  importTo,
  projectOf,
  sourceFile,
} from '#harness/tests/support/project-builder';

const TEST = 'backend/tests/unit/modules/store/application/find.test.ts';
const HANDLER = `${MODULES}/store/application/find.ts`;
const ADAPTER = `${MODULES}/store/infrastructure/disk.adapter.ts`;
const DATABASE = `${SHARED}/infrastructure/database.ts`;
const MEMORY_ONLY = 'A unit test touches memory only. This one reaches ';
const IO_LAYER = 'a file of a layer that does I/O';

const rule = (): Rule => unitTestReach(structureOf());

function typeOf(target: string, line = 1): ImportRecord {
  return importOf({
    specifier: `#${target}`,
    kind: 'alias',
    line,
    target,
    typeOnly: true,
  });
}

/** An import of a module of Node, on a line. */
function builtin(specifier: string, line: number): ImportRecord {
  return { ...importFrom(specifier, 'x'), line };
}

describe('unitTestReach', () => {
  it('should report a unit test that imports a value from infrastructure', () => {
    const project = projectOf(
      sourceFile(TEST, [importTo(HANDLER, 3), importTo(ADAPTER, 4)]),
      sourceFile(HANDLER),
      sourceFile(ADAPTER),
    );

    expect(rule().check(project)).toEqual([
      {
        rule: 'unit-test-reach',
        path: TEST,
        line: 4,
        detail: `${MEMORY_ONLY}${IO_LAYER} through ${TEST} → ${ADAPTER}.`,
      },
    ]);
  });

  it('should pass a unit test that imports only a type from infrastructure', () => {
    const project = projectOf(
      sourceFile(TEST, [typeOf(ADAPTER)]),
      sourceFile(ADAPTER, [builtin('node:fs', 1)]),
    );

    expect(rule().check(project)).toEqual([]);
  });

  it('should follow a chain of imports, and point at its first step', () => {
    const project = projectOf(
      sourceFile(TEST, [importTo(HANDLER, 7)]),
      sourceFile(HANDLER, [importTo(DATABASE, 2)]),
      sourceFile(DATABASE),
    );

    expect(rule().check(project)).toEqual([
      {
        rule: 'unit-test-reach',
        path: TEST,
        line: 7,
        detail:
          `${MEMORY_ONLY}${IO_LAYER} through ` +
          `${TEST} → ${HANDLER} → ${DATABASE}.`,
      },
    ]);
  });

  it('should not follow a type in the middle of a chain', () => {
    const project = projectOf(
      sourceFile(TEST, [importTo(HANDLER)]),
      sourceFile(HANDLER, [typeOf(DATABASE)]),
      sourceFile(DATABASE),
    );

    expect(rule().check(project)).toEqual([]);
  });

  it('should report a unit test that does I/O with its own hands', () => {
    const project = projectOf(
      sourceFile(TEST, [
        builtin('node:path', 1),
        builtin('node:fs', 2),
        builtin('node:net', 3),
      ]),
    );

    expect(rule().check(project)).toEqual([
      {
        rule: 'unit-test-reach',
        path: TEST,
        line: 2,
        detail: `${MEMORY_ONLY}node:fs through ${TEST}.`,
      },
    ]);
  });

  it('should report what a file of the tests does for a unit test', () => {
    const support = 'backend/tests/support/database.ts';
    const project = projectOf(
      sourceFile(TEST, [importTo(HANDLER, 1), importTo(support, 2)]),
      sourceFile(HANDLER),
      sourceFile(support, [builtin('node:fs/promises', 1)]),
    );

    expect(
      rule()
        .check(project)
        .map((finding) => finding.detail),
    ).toEqual([`${MEMORY_ONLY}node:fs/promises through ${TEST} → ${support}.`]);
    expect(rule().check(project)[0]?.line).toBe(2);
  });

  it('should judge the unit tests of the client the same way', () => {
    const test = 'frontend/tests/unit/screens/runs/runs.test.tsx';
    const screen = 'frontend/src/screens/runs/runs.tsx';
    const client = 'frontend/src/api/client.ts';
    const project = projectOf(
      sourceFile(test, [importTo(screen)]),
      sourceFile(screen, [importTo(client)]),
      sourceFile(client, [builtin('node:net', 1)]),
    );

    expect(
      rule()
        .check(project)
        .map((finding) => finding.detail),
    ).toEqual([
      `${MEMORY_ONLY}node:net through ${test} → ${screen} → ${client}.`,
    ]);
  });

  it.each([
    ['a module of Node that does no I/O', builtin('node:path', 1)],
    [
      'a type of a module of Node',
      { ...builtin('node:fs', 1), typeOnly: true },
    ],
    ['a package with the name of such a module', importFrom('fs', 'x')],
    ['a package whose name ends like such a module', importFrom('left-fs')],
    ['a module whose name only starts the same', builtin('node:fstab', 1)],
    [
      'an alias that leads to no file',
      importOf({ specifier: '#x', kind: 'alias' }),
    ],
  ])('should pass a unit test that imports %s', (_, record) => {
    expect(rule().check(projectOf(sourceFile(TEST, [record])))).toEqual([]);
  });

  it.each([
    'backend/tests/integration/store/disk.adapter.test.ts',
    'backend/tests/e2e/find.test.ts',
    'backend/tests/unit/modules/store/application/builder.ts',
    'backend/tests/support/database.ts',
    'harness/tests/unit/gate/steps.test.ts',
    'tests/unit/a.test.ts',
  ])('should not judge %s, which is no unit test of a workspace', (path) => {
    const project = projectOf(
      sourceFile(path, [importTo(ADAPTER), builtin('node:fs', 2)]),
      sourceFile(ADAPTER),
    );

    expect(rule().check(project)).toEqual([]);
  });

  it('should come to an end when the files import each other in a circle', () => {
    const other = `${MODULES}/store/application/list.ts`;
    const project = projectOf(
      sourceFile(TEST, [importTo(HANDLER)]),
      sourceFile(HANDLER, [importTo(other)]),
      sourceFile(other, [importTo(HANDLER)]),
    );

    expect(rule().check(project)).toEqual([]);
  });

  it('should report one finding for a test, however many ways lead out', () => {
    const project = projectOf(
      sourceFile(TEST, [importTo(ADAPTER, 1), importTo(DATABASE, 2)]),
      sourceFile(ADAPTER),
      sourceFile(DATABASE),
    );

    expect(rule().check(project)).toHaveLength(1);
  });
});
