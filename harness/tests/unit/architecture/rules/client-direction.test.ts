import { describe, expect, it } from 'vitest';

import type { Rule } from '#harness/architecture/project';
import { clientDirection } from '#harness/architecture/rules/client-direction';
import { frontendOf } from '#harness/tests/support/policy-builder';
import {
  detailsBetween,
  importFrom,
  importOf,
  importTo,
  projectOf,
  sourceFile,
} from '#harness/tests/support/project-builder';

const SOURCE = 'frontend/src';
const rule = (): Rule => clientDirection(frontendOf());

/** What the rule says about one file of the client that imports another. */
function detailsFor(from: string, to: string): string[] {
  return detailsBetween(rule(), `${SOURCE}/${from}`, `${SOURCE}/${to}`);
}

describe('clientDirection, for one import', () => {
  it('should report a command that imports a screen, on its line', () => {
    const project = projectOf(
      sourceFile(`${SOURCE}/commands/list.ts`, [
        importTo(`${SOURCE}/screens/overview/overview.tsx`, 4),
      ]),
    );

    expect(rule().check(project)).toEqual([
      {
        rule: 'client-direction',
        path: `${SOURCE}/commands/list.ts`,
        line: 4,
        detail: 'commands/ may not import screens/.',
      },
    ]);
  });

  it.each([
    ['api/client.ts', 'components/badge.tsx'],
    ['hooks/use-keys.ts', 'api/client.ts'],
    ['components/badge.tsx', 'api/client.ts'],
    ['components/badge.tsx', 'screens/runs/runs.tsx'],
    ['theme/colors.ts', 'hooks/use-keys.ts'],
    ['commands/list.ts', 'hooks/use-keys.ts'],
    ['screens/runs/runs.tsx', 'app/app.tsx'],
    ['screens/runs/runs.tsx', 'commands/list.ts'],
  ])('should refuse %s that imports %s', (from, to) => {
    const [folder = ''] = from.split('/');
    const [other = ''] = to.split('/');

    expect(detailsFor(from, to)).toEqual([
      `${folder}/ may not import ${other}/.`,
    ]);
  });

  it.each([
    ['main.tsx', 'app/app.tsx'],
    ['main.tsx', 'commands/list.ts'],
    ['app/app.tsx', 'screens/runs/runs.tsx'],
    ['app/app.tsx', 'components/badge.tsx'],
    ['app/app.tsx', 'hooks/use-keys.ts'],
    ['app/app.tsx', 'theme/colors.ts'],
    ['app/app.tsx', 'api/client.ts'],
    ['app/app.tsx', 'app/routes.tsx'],
    ['screens/runs/runs.tsx', 'components/badge.tsx'],
    ['screens/runs/runs.tsx', 'hooks/use-keys.ts'],
    ['screens/runs/runs.tsx', 'theme/colors.ts'],
    ['screens/runs/runs.tsx', 'api/client.ts'],
    ['commands/list.ts', 'api/client.ts'],
    ['commands/list.ts', 'theme/colors.ts'],
    ['commands/list.ts', 'commands/print.ts'],
    ['components/badge.tsx', 'components/row.tsx'],
    ['components/badge.tsx', 'hooks/use-keys.ts'],
    ['components/badge.tsx', 'theme/colors.ts'],
    ['hooks/use-keys.ts', 'hooks/use-focus.ts'],
    ['hooks/use-keys.ts', 'theme/colors.ts'],
    ['api/client.ts', 'api/socket.ts'],
    ['theme/colors.ts', 'theme/palette.ts'],
  ])('should pass %s that imports %s', (from, to) => {
    expect(detailsFor(from, to)).toEqual([]);
  });

  it('should refuse a screen that imports another screen', () => {
    expect(
      detailsFor('screens/overview/overview.tsx', 'screens/runs/runs.tsx'),
    ).toEqual([
      'One part of screens/ does not import another: overview imports runs.',
    ]);
  });

  it('should pass a screen that imports its own folder, at any depth', () => {
    expect(
      detailsFor('screens/runs/runs.tsx', 'screens/runs/parts/row.tsx'),
    ).toEqual([]);
    expect(
      detailsFor('screens/runs/parts/row.tsx', 'screens/runs/use-runs.tsx'),
    ).toEqual([]);
  });

  it('should take a file of screens/ itself for a screen of its own', () => {
    expect(detailsFor('screens/list.tsx', 'screens/runs/runs.tsx')).toEqual([
      'One part of screens/ does not import another: list.tsx imports runs.',
    ]);
  });

  it('should let a file at the root import only what its row lists', () => {
    expect(detailsFor('main.tsx', 'screens/runs/runs.tsx')).toEqual([
      'A file at the root may not import screens/.',
    ]);
    expect(detailsFor('main.tsx', 'settings.ts')).toEqual([]);
  });

  it('should let nothing import a file at the root', () => {
    expect(detailsFor('app/app.tsx', 'main.tsx')).toEqual([
      'app/ may not import a file at the root.',
    ]);
  });

  it('should refuse a folder the table does not have', () => {
    expect(detailsFor('widgets/gauge.tsx', 'theme/colors.ts')).toEqual([
      'widgets/ is not a folder of the client.',
    ]);
    expect(detailsFor('app/app.tsx', 'widgets/gauge.tsx')).toEqual([
      'app/ may not import widgets/.',
    ]);
    expect(detailsFor('widgets/gauge.tsx', 'widgets/dial.tsx')).toEqual([]);
  });

  it('should count an import of a type: it is a dependency of the design', () => {
    const project = projectOf(
      sourceFile(`${SOURCE}/commands/list.ts`, [
        importOf({
          specifier: '#screens/runs/runs',
          kind: 'alias',
          target: `${SOURCE}/screens/runs/runs.tsx`,
          typeOnly: true,
        }),
      ]),
    );

    expect(rule().check(project)).toHaveLength(1);
  });

  it('should leave alone what is not between two files of the client', () => {
    const project = projectOf(
      sourceFile(`${SOURCE}/api/client.ts`, [
        importFrom('node:net', 'connect'),
        importOf({ specifier: '#components/gone', kind: 'alias' }),
      ]),
      sourceFile('frontend/tests/unit/commands/list.test.ts', [
        importTo(`${SOURCE}/screens/runs/runs.tsx`),
      ]),
      sourceFile('backend/src/commands/list.ts', [
        importTo('backend/src/screens/runs.ts'),
      ]),
    );

    expect(rule().check(project)).toEqual([]);
  });
});

describe('clientDirection, for a chain of imports', () => {
  /** A client whose table lets hooks/ import api/, as a slip would. */
  const loose = (): Rule => {
    const frontend = frontendOf();
    const folders = new Map(frontend.folders).set('hooks', ['theme', 'api']);
    return clientDirection({ ...frontend, folders });
  };

  const chained = projectOf(
    sourceFile(`${SOURCE}/components/badge.tsx`, [
      importTo(`${SOURCE}/theme/colors.ts`, 1),
      importTo(`${SOURCE}/hooks/use-runs.ts`, 2),
    ]),
    sourceFile(`${SOURCE}/hooks/use-runs.ts`, [
      importTo(`${SOURCE}/api/client.ts`, 5),
    ]),
    sourceFile(`${SOURCE}/api/client.ts`),
    sourceFile(`${SOURCE}/theme/colors.ts`),
  );

  it('should report a component that reaches api/ through a hook', () => {
    expect(loose().check(chained)).toEqual([
      {
        rule: 'client-direction',
        path: `${SOURCE}/components/badge.tsx`,
        line: 2,
        detail:
          'components/ reaches api/ through a chain of imports: ' +
          `${SOURCE}/components/badge.tsx → ${SOURCE}/hooks/use-runs.ts → ` +
          `${SOURCE}/api/client.ts.`,
      },
    ]);
  });

  it('should report a chain one time for a file that starts it twice', () => {
    const twice = projectOf(
      sourceFile(`${SOURCE}/components/badge.tsx`, [
        importTo(`${SOURCE}/hooks/use-runs.ts`, 2),
        importTo(`${SOURCE}/hooks/use-runs.ts`, 3),
      ]),
      sourceFile(`${SOURCE}/hooks/use-runs.ts`, [
        importTo(`${SOURCE}/api/client.ts`),
      ]),
      sourceFile(`${SOURCE}/api/client.ts`),
    );

    expect(
      loose()
        .check(twice)
        .map((finding) => finding.line),
    ).toEqual([2]);
  });

  it('should report the import that the table refuses as well', () => {
    expect(
      rule()
        .check(chained)
        .map((finding) => finding.path),
    ).toEqual([
      `${SOURCE}/components/badge.tsx`,
      `${SOURCE}/hooks/use-runs.ts`,
    ]);
  });

  it('should leave a chain of one import to the table', () => {
    const direct = projectOf(
      sourceFile(`${SOURCE}/components/badge.tsx`, [
        importTo(`${SOURCE}/api/client.ts`),
      ]),
      sourceFile(`${SOURCE}/api/client.ts`),
    );

    expect(
      rule()
        .check(direct)
        .map((finding) => finding.detail),
    ).toEqual(['components/ may not import api/.']);
  });

  it('should pass a screen that reaches api/: only some folders never may', () => {
    const project = projectOf(
      sourceFile(`${SOURCE}/app/app.tsx`, [
        importTo(`${SOURCE}/screens/runs/runs.tsx`),
      ]),
      sourceFile(`${SOURCE}/screens/runs/runs.tsx`, [
        importTo(`${SOURCE}/api/client.ts`),
      ]),
      sourceFile(`${SOURCE}/api/client.ts`),
    );

    expect(rule().check(project)).toEqual([]);
  });

  it('should come to an end when components import each other in a circle', () => {
    const project = projectOf(
      sourceFile(`${SOURCE}/components/a.tsx`, [
        importTo(`${SOURCE}/components/b.tsx`),
      ]),
      sourceFile(`${SOURCE}/components/b.tsx`, [
        importTo(`${SOURCE}/components/a.tsx`),
      ]),
    );

    expect(rule().check(project)).toEqual([]);
  });
});
