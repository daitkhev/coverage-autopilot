import { describe, expect, it } from 'vitest';

import type { Rule } from '#harness/architecture/project';
import { misplacedFile } from '#harness/architecture/rules/misplaced-file';
import { backendOf, MODULES } from '#harness/tests/support/policy-builder';
import { projectOf, sourceFile } from '#harness/tests/support/project-builder';

const rule = (): Rule => misplacedFile(backendOf());

function detailsFor(inModule: string): string[] {
  return rule()
    .check(projectOf(sourceFile(`${MODULES}/${inModule}`)))
    .map((finding) => finding.detail);
}

describe('misplacedFile', () => {
  it('should report a role suffix outside the folder of its role', () => {
    expect(detailsFor('store/application/item.entity.ts')).toEqual([
      'A ".entity.ts" file belongs in domain/entities/.',
    ]);
  });

  it('should name every folder a suffix may be in', () => {
    expect(detailsFor('store/infrastructure/missing.error.ts')).toEqual([
      'A ".error.ts" file belongs in domain/errors/ or application/errors/.',
    ]);
  });

  it('should pass a role suffix in one of its folders', () => {
    expect(detailsFor('store/domain/entities/item.entity.ts')).toEqual([]);
    expect(detailsFor('store/domain/entities/deep/item.entity.ts')).toEqual([]);
    expect(detailsFor('store/application/errors/missing.error.ts')).toEqual([]);
  });

  it('should pass a file with no role suffix anywhere in a layer', () => {
    expect(detailsFor('store/infrastructure/lcov/read-lines.ts')).toEqual([]);
  });

  describe('the module file', () => {
    it('should pass the module file at the root of its module', () => {
      expect(detailsFor('store/store.module.ts')).toEqual([]);
    });

    it('should report any other file at the root of a module', () => {
      expect(detailsFor('store/setup.ts')).toEqual([
        'Only "store.module.ts" may be at the root of this module.',
      ]);
      expect(detailsFor('store/reports.module.ts')).toHaveLength(1);
    });

    it('should report a module file inside a layer', () => {
      expect(detailsFor('store/infrastructure/store.module.ts')).toEqual([
        'A ".module.ts" file belongs at the root of its module.',
      ]);
    });
  });

  it('should leave an unknown module and other places to other rules', () => {
    const project = projectOf(
      sourceFile(`${MODULES}/billing/application/invoice.entity.ts`),
      sourceFile('backend/src/shared/kernel/item.entity.ts'),
      sourceFile('backend/tests/unit/item.entity.ts'),
    );

    expect(rule().check(project)).toEqual([]);
  });
});
