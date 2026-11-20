import { describe, expect, it } from '@jest/globals';

import { layerDirection } from '#harness/architecture/rules/layer-direction';
import {
  backendOf,
  MODULES,
  SHARED,
} from '#harness/tests/support/policy-builder';
import {
  detailsBetween,
  importOf,
  importTo,
  projectOf,
  sourceFile,
} from '#harness/tests/support/project-builder';

const rule = layerDirection(backendOf());

function detailsFor(from: string, to: string): string[] {
  return detailsBetween(rule, from, to);
}

describe('layerDirection', () => {
  describe('inside one module', () => {
    it('should report a layer that imports a layer it may not', () => {
      const project = projectOf(
        sourceFile(`${MODULES}/store/domain/services/count.service.ts`, [
          importTo(`${MODULES}/store/infrastructure/reader.ts`, 4),
        ]),
      );

      expect(rule.check(project)).toEqual([
        {
          rule: 'layer-direction',
          path: `${MODULES}/store/domain/services/count.service.ts`,
          line: 4,
          detail: 'domain may not import infrastructure.',
        },
      ]);
    });

    it('should report it when only a type is imported', () => {
      const record = importOf({
        specifier: '#store/infrastructure/reader',
        kind: 'alias',
        target: `${MODULES}/store/infrastructure/reader.ts`,
        typeOnly: true,
      });
      const file = sourceFile(`${MODULES}/store/domain/item.ts`, [record]);

      expect(rule.check(projectOf(file))).toHaveLength(1);
    });

    it.each([
      ['infrastructure/reader.ts', 'domain/item.ts'],
      ['infrastructure/reader.ts', 'application/ports/reader.port.ts'],
      ['application/find.ts', 'contracts/item.dto.ts'],
      ['domain/item.ts', 'domain/price.ts'],
    ])('should pass %s importing %s', (from, to) => {
      expect(
        detailsFor(`${MODULES}/store/${from}`, `${MODULES}/store/${to}`),
      ).toEqual([]);
    });

    it('should report a layer that imports the module file', () => {
      expect(
        detailsFor(
          `${MODULES}/store/application/find.ts`,
          `${MODULES}/store/store.module.ts`,
        ),
      ).toEqual(['application may not import the module file.']);
    });

    it('should let the module file import any layer of its module', () => {
      expect(
        detailsFor(
          `${MODULES}/store/store.module.ts`,
          `${MODULES}/store/infrastructure/reader.ts`,
        ),
      ).toEqual([]);
    });
  });

  describe('from a layer to the shared code', () => {
    it('should report a folder the layer may not import', () => {
      expect(
        detailsFor(
          `${MODULES}/store/domain/item.ts`,
          `${SHARED}/infrastructure/database/open.ts`,
        ),
      ).toEqual(['domain may not import shared/infrastructure.']);
    });

    it('should pass a folder the layer may import', () => {
      expect(
        detailsFor(
          `${MODULES}/store/domain/item.ts`,
          `${SHARED}/kernel/result.ts`,
        ),
      ).toEqual([]);
    });
  });

  describe('inside the shared code', () => {
    it('should report shared code that imports a module', () => {
      expect(
        detailsFor(
          `${SHARED}/kernel/result.ts`,
          `${MODULES}/store/contracts/item.dto.ts`,
        ),
      ).toEqual(['shared/kernel may not import a module.']);
    });

    it('should report a folder that imports one above it', () => {
      expect(
        detailsFor(
          `${SHARED}/kernel/result.ts`,
          `${SHARED}/application/ports/clock.port.ts`,
        ),
      ).toEqual(['shared/kernel may not import shared/application.']);
    });

    it('should pass a folder that imports one below it, or itself', () => {
      expect(
        detailsFor(
          `${SHARED}/infrastructure/database/open.ts`,
          `${SHARED}/kernel/result.ts`,
        ),
      ).toEqual([]);
      expect(
        detailsFor(`${SHARED}/kernel/result.ts`, `${SHARED}/kernel/clock.ts`),
      ).toEqual([]);
    });
  });

  it('should leave another module to the rules of the modules', () => {
    expect(
      detailsFor(
        `${MODULES}/reports/domain/report.ts`,
        `${MODULES}/store/infrastructure/reader.ts`,
      ),
    ).toEqual([]);
  });

  it('should leave tests and an unknown layer alone', () => {
    expect(
      detailsFor(
        'backend/tests/unit/store/item.test.ts',
        `${MODULES}/store/infrastructure/reader.ts`,
      ),
    ).toEqual([]);
    expect(
      detailsFor(
        `${MODULES}/store/adapters/reader.ts`,
        `${MODULES}/store/infrastructure/reader.ts`,
      ),
    ).toEqual([]);
  });
});
