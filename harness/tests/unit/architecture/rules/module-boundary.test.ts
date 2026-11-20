import { describe, expect, it } from '@jest/globals';

import { moduleBoundary } from '#harness/architecture/rules/module-boundary';
import {
  backendOf,
  MODULES,
  SHARED,
} from '#harness/tests/support/policy-builder';
import {
  importTo,
  projectOf,
  sourceFile,
} from '#harness/tests/support/project-builder';

const rule = moduleBoundary(backendOf());
const BY_CONTRACTS = 'Another module is reached through its contracts/ only.';
const BY_MODULE_FILE = 'A module is wired in through its module file only.';

function detailsFor(from: string, to: string): string[] {
  return rule
    .check(projectOf(sourceFile(from, [importTo(to)])))
    .map((finding) => finding.detail);
}

describe('moduleBoundary', () => {
  it('should report a reach past the contracts of another module', () => {
    const project = projectOf(
      sourceFile(`${MODULES}/reports/application/build.ts`, [
        importTo(`${MODULES}/store/domain/entities/item.entity.ts`, 2),
      ]),
    );

    expect(rule.check(project)).toEqual([
      {
        rule: 'module-boundary',
        path: `${MODULES}/reports/application/build.ts`,
        line: 2,
        detail: BY_CONTRACTS,
      },
    ]);
  });

  it('should report a layer importing the module file of another module', () => {
    expect(
      detailsFor(
        `${MODULES}/reports/application/build.ts`,
        `${MODULES}/store/store.module.ts`,
      ),
    ).toEqual([BY_CONTRACTS]);
  });

  it.each(['application', 'contracts'])(
    'should pass %s importing the contracts of another module',
    (layer) => {
      expect(
        detailsFor(
          `${MODULES}/reports/${layer}/build.ts`,
          `${MODULES}/store/contracts/item.dto.ts`,
        ),
      ).toEqual([]);
    },
  );

  it.each(['domain', 'infrastructure'])(
    'should report %s importing the contracts of another module',
    (layer) => {
      expect(
        detailsFor(
          `${MODULES}/reports/${layer}/build.ts`,
          `${MODULES}/store/contracts/item.dto.ts`,
        ),
      ).toEqual([`${layer} may not reach another module.`]);
    },
  );

  describe('wiring', () => {
    it('should pass a module file importing another module file', () => {
      expect(
        detailsFor(
          `${MODULES}/reports/reports.module.ts`,
          `${MODULES}/store/store.module.ts`,
        ),
      ).toEqual([]);
    });

    it('should report a module file importing inside another module', () => {
      expect(
        detailsFor(
          `${MODULES}/reports/reports.module.ts`,
          `${MODULES}/store/contracts/item.dto.ts`,
        ),
      ).toEqual([BY_MODULE_FILE]);
    });

    it('should pass a root file importing a module file', () => {
      expect(
        detailsFor('backend/src/main.ts', `${MODULES}/store/store.module.ts`),
      ).toEqual([]);
    });

    it('should report a root file importing inside a module', () => {
      expect(
        detailsFor(
          'backend/src/main.ts',
          `${MODULES}/store/application/find.ts`,
        ),
      ).toEqual([BY_MODULE_FILE]);
    });
  });

  it('should pass imports that stay in one module or go to shared code', () => {
    expect(
      detailsFor(
        `${MODULES}/store/application/find.ts`,
        `${MODULES}/store/domain/item.ts`,
      ),
    ).toEqual([]);
    expect(
      detailsFor('backend/src/main.ts', `${SHARED}/infrastructure/open.ts`),
    ).toEqual([]);
  });

  it('should let a test reach inside a module', () => {
    expect(
      detailsFor(
        'backend/tests/unit/store/item.test.ts',
        `${MODULES}/store/domain/item.ts`,
      ),
    ).toEqual([]);
  });
});
