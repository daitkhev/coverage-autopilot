import { describe, expect, it } from 'vitest';

import type { Rule } from '#harness/architecture/project';
import { workspaceBoundary } from '#harness/architecture/rules/workspace-boundary';
import { structureOf } from '#harness/tests/support/policy-builder';
import {
  detailsBetween,
  importOf,
  importTo,
  projectOf,
  sourceFile,
} from '#harness/tests/support/project-builder';

const rule = (): Rule => workspaceBoundary(structureOf());

function detailsFor(from: string, to: string): string[] {
  return detailsBetween(rule(), from, to);
}

describe('workspaceBoundary', () => {
  it('should report an import from one workspace into another', () => {
    const project = projectOf(
      sourceFile('frontend/src/api/client.ts', [
        importTo('backend/src/main.ts', 5),
      ]),
    );

    expect(rule().check(project)).toEqual([
      {
        rule: 'workspace-boundary',
        path: 'frontend/src/api/client.ts',
        line: 5,
        detail: 'frontend may not import a file of backend.',
      },
    ]);
  });

  it('should report an import from the root into a workspace', () => {
    expect(detailsFor('harness/bin/check.ts', 'backend/src/main.ts')).toEqual([
      'the root may not import a file of backend.',
    ]);
  });

  it('should report an import from a workspace into the root', () => {
    expect(detailsFor('backend/src/main.ts', 'harness/bin/check.ts')).toEqual([
      'backend may not import a file of the root.',
    ]);
  });

  it('should pass imports that stay where they are', () => {
    expect(detailsFor('backend/src/main.ts', 'backend/src/app.ts')).toEqual([]);
    expect(detailsFor('harness/bin/check.ts', 'harness/gate/steps.ts')).toEqual(
      [],
    );
  });

  it('should leave packages and unresolved aliases to other rules', () => {
    const file = sourceFile('frontend/src/api/client.ts', [
      importOf({ specifier: '@scope/contracts', kind: 'package' }),
      importOf({ specifier: '#gone/file', kind: 'alias' }),
    ]);

    expect(rule().check(projectOf(file))).toEqual([]);
  });
});
