import { describe, expect, it } from 'vitest';

import type { Rule } from '#harness/architecture/project';
import { moduleBoundary } from '#harness/architecture/rules/module-boundary';
import {
  backendOf,
  MODULES,
  SHARED,
} from '#harness/tests/support/policy-builder';
import {
  detailsBetween,
  importTo,
  projectOf,
  sourceFile,
} from '#harness/tests/support/project-builder';

const rule = (): Rule => moduleBoundary(backendOf());
const BY_CONTRACTS = 'Another module is reached through its contracts/ only.';
const BY_MODULE_FILE = 'A module is wired in through its module file only.';

function detailsFor(from: string, to: string): string[] {
  return detailsBetween(rule(), from, to);
}

describe('moduleBoundary', () => {
  it('should report a reach past the contracts of another module', () => {
    const project = projectOf(
      sourceFile(`${MODULES}/reports/application/build.ts`, [
        importTo(`${MODULES}/store/domain/entities/item.entity.ts`, 2),
      ]),
    );

    expect(rule().check(project)).toEqual([
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

  describe('when the contracts are a part of the application layer', () => {
    const inside = backendOf();
    const nested = moduleBoundary({
      ...inside,
      layers: new Map([
        ...inside.layers,
        ['application/contracts', { layers: [], shared: [] }],
      ]),
      contracts: ['application/contracts'],
    });

    it('should pass a module that enters another through them', () => {
      expect(
        detailsBetween(
          nested,
          `${MODULES}/reports/application/build.ts`,
          `${MODULES}/store/application/contracts/item.dto.ts`,
        ),
      ).toEqual([]);
    });

    it('should report a reach into the rest of the application layer', () => {
      expect(
        detailsBetween(
          nested,
          `${MODULES}/reports/application/build.ts`,
          `${MODULES}/store/application/dto/item.dto.ts`,
        ),
      ).toEqual([BY_CONTRACTS]);
    });
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
