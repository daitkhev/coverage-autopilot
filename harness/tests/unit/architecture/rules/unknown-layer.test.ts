import { describe, expect, it } from '@jest/globals';

import { unknownLayer } from '#harness/architecture/rules/unknown-layer';
import {
  backendOf,
  MODULES,
  SHARED,
} from '#harness/tests/support/policy-builder';
import { projectOf, sourceFile } from '#harness/tests/support/project-builder';

const rule = unknownLayer(backendOf());

function detailsFor(path: string): string[] {
  return rule
    .check(projectOf(sourceFile(path)))
    .map((finding) => finding.detail);
}

describe('unknownLayer', () => {
  it('should report a folder of a module that is not a layer', () => {
    expect(detailsFor(`${MODULES}/store/adapters/reader.ts`)).toEqual([
      '"adapters" is not a layer. The layers are: ' +
        'domain, application, infrastructure, contracts.',
    ]);
  });

  it('should report a folder of the shared code the policy does not list', () => {
    expect(detailsFor(`${SHARED}/domain/money.ts`)).toEqual([
      '"domain" is not a folder of the shared code: ' +
        'kernel, application, infrastructure.',
    ]);
  });

  it.each([
    'backend/src/workers/queue-worker.ts',
    `${MODULES}/setup.ts`,
    `${SHARED}/clock.ts`,
  ])('should report %s as a place the service does not have', (path) => {
    expect(detailsFor(path)).toHaveLength(1);
    expect(detailsFor(path)[0]).toContain('and no other place');
  });

  it.each([
    `${MODULES}/store/domain/entities/item.entity.ts`,
    `${MODULES}/store/contracts/item.dto.ts`,
    `${MODULES}/store/store.module.ts`,
    `${SHARED}/kernel/result.ts`,
    'backend/src/main.ts',
    'backend/tests/unit/store/item.test.ts',
    'harness/bin/check.ts',
  ])('should pass %s', (path) => {
    expect(detailsFor(path)).toEqual([]);
  });

  it('should leave the layers of an unknown module to another rule', () => {
    expect(detailsFor(`${MODULES}/billing/adapters/reader.ts`)).toEqual([]);
  });
});
