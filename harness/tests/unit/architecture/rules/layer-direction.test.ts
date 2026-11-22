import { describe, expect, it } from 'vitest';

import type { Rule } from '#harness/architecture/project';
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

const rule = (): Rule => layerDirection(backendOf());

function detailsFor(from: string, to: string): string[] {
  return detailsBetween(rule(), from, to);
}

describe('layerDirection', () => {
  describe('inside one module', () => {
    it('should report a layer that imports a layer it may not', () => {
      const project = projectOf(
        sourceFile(`${MODULES}/store/domain/services/count.service.ts`, [
          importTo(`${MODULES}/store/infrastructure/reader.ts`, 4),
        ]),
      );

      expect(rule().check(project)).toEqual([
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

      expect(rule().check(projectOf(file))).toHaveLength(1);
    });

    it.each([
      ['infrastructure/reader.ts', 'domain/item.ts'],
      ['infrastructure/reader.ts', 'application/ports/reader.port.ts'],
      ['application/find.ts', 'application/contracts/item.dto.ts'],
      ['infrastructure/http/items.controller.ts', 'application/find.ts'],
      ['domain/item.ts', 'domain/price.ts'],
    ])('should pass %s importing %s', (from, to) => {
      expect(
        detailsFor(`${MODULES}/store/${from}`, `${MODULES}/store/${to}`),
      ).toEqual([]);
    });

    it.each([
      ['application/contracts/item.dto.ts', 'application/find.ts'],
      ['application/find.ts', 'infrastructure/http/items.controller.ts'],
      ['infrastructure/reader.ts', 'infrastructure/http/items.controller.ts'],
      ['infrastructure/http/items.controller.ts', 'infrastructure/reader.ts'],
      ['infrastructure/http/items.controller.ts', 'domain/item.ts'],
    ])('should report %s importing %s', (from, to) => {
      expect(
        detailsFor(`${MODULES}/store/${from}`, `${MODULES}/store/${to}`),
      ).toHaveLength(1);
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

  describe('into the composition', () => {
    const COMPOSITION = 'backend/src/composition/app.module.ts';

    it.each([
      `${MODULES}/store/application/find.ts`,
      `${MODULES}/store/infrastructure/reader.ts`,
      `${MODULES}/store/store.module.ts`,
      `${SHARED}/infrastructure/queue/worker.ts`,
    ])('should report %s importing it', (from) => {
      expect(detailsFor(from, COMPOSITION)).toEqual([
        'Only the entry of the service imports the composition.',
      ]);
    });

    it.each([
      'backend/src/main.ts',
      'backend/src/composition/service-run.ts',
      'backend/tests/integration/composition/app-module.test.ts',
    ])('should pass %s importing it', (from) => {
      expect(detailsFor(from, COMPOSITION)).toEqual([]);
    });
  });

  describe('from the entry of the service', () => {
    it.each([
      `${MODULES}/store/store.module.ts`,
      `${MODULES}/store/application/find.ts`,
      `${SHARED}/infrastructure/open.ts`,
    ])('should report it importing %s', (to) => {
      expect(detailsFor('backend/src/main.ts', to)).toEqual([
        'The entry of the service imports the composition only.',
      ]);
    });
  });

  describe('inside the shared code', () => {
    it('should report shared code that imports a module', () => {
      expect(
        detailsFor(
          `${SHARED}/kernel/result.ts`,
          `${MODULES}/store/application/contracts/item.dto.ts`,
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
