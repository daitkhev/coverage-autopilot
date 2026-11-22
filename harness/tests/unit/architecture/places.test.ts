import { describe, expect, it } from 'vitest';

import { moduleOf, placeOf, workspaceOf } from '#harness/architecture/places';
import {
  backendOf,
  MODULES,
  SHARED,
  structureOf,
} from '#harness/tests/support/policy-builder';

const backend = backendOf();

describe('placeOf', () => {
  it('should read the module, the layer and the path inside the module', () => {
    const path = `${MODULES}/store/domain/entities/item.entity.ts`;

    expect(placeOf(path, backend)).toEqual({
      kind: 'layer',
      module: 'store',
      layer: 'domain',
      inside: 'domain/entities/item.entity.ts',
    });
  });

  describe('when the policy gives a part of a layer a rule of its own', () => {
    it('should place a file of the part in the part', () => {
      const path = `${MODULES}/store/application/contracts/item.dto.ts`;

      expect(placeOf(path, backend)).toMatchObject({
        layer: 'application/contracts',
        inside: 'application/contracts/item.dto.ts',
      });
    });

    it('should leave the rest of the layer in the layer', () => {
      const path = `${MODULES}/store/application/dto/item.dto.ts`;

      expect(placeOf(path, backend)).toMatchObject({ layer: 'application' });
    });

    it('should not take a file for a part of a layer', () => {
      const path = `${MODULES}/store/application/contracts.ts`;

      expect(placeOf(path, backend)).toMatchObject({ layer: 'application' });
    });
  });

  it('should read a file at the root of a module', () => {
    expect(placeOf(`${MODULES}/store/store.module.ts`, backend)).toEqual({
      kind: 'module-file',
      module: 'store',
      inside: 'store.module.ts',
    });
  });

  it('should read a folder of the shared code', () => {
    expect(placeOf(`${SHARED}/kernel/deep/result.ts`, backend)).toEqual({
      kind: 'shared',
      part: 'kernel',
    });
  });

  it('should read a file at the root of the source', () => {
    expect(placeOf('backend/src/main.ts', backend)).toEqual({
      kind: 'service-root',
    });
  });

  it.each([
    'backend/src/workers/queue-worker.ts',
    `${MODULES}/setup.ts`,
    `${SHARED}/clock.ts`,
  ])('should not know %s', (path) => {
    expect(placeOf(path, backend)).toEqual({ kind: 'unknown' });
  });

  it.each([
    'backend/tests/unit/item.test.ts',
    'backend/package.json',
    'frontend/src/modules/store/domain/item.ts',
    'harness/bin/check.ts',
  ])('should read %s as outside the service', (path) => {
    expect(placeOf(path, backend)).toEqual({ kind: 'other' });
  });
});

describe('moduleOf', () => {
  it('should give the module of a layer and of a module file', () => {
    const inLayer = placeOf(`${MODULES}/store/domain/item.ts`, backend);
    const atRoot = placeOf(`${MODULES}/runs/runs.module.ts`, backend);

    expect(moduleOf(inLayer)).toBe('store');
    expect(moduleOf(atRoot)).toBe('runs');
  });

  it('should give nothing for a place outside the modules', () => {
    expect(moduleOf(placeOf(`${SHARED}/kernel/a.ts`, backend))).toBeUndefined();
    expect(moduleOf(placeOf('backend/src/main.ts', backend))).toBeUndefined();
  });
});

describe('workspaceOf', () => {
  const structure = structureOf();

  it('should give the workspace a file is in', () => {
    expect(workspaceOf('backend/src/main.ts', structure)).toBe('backend');
    expect(workspaceOf('frontend/package.json', structure)).toBe('frontend');
  });

  it('should give nothing outside the workspaces', () => {
    expect(workspaceOf('harness/bin/check.ts', structure)).toBeUndefined();
    expect(workspaceOf('package.json', structure)).toBeUndefined();
    expect(workspaceOf('backend', structure)).toBeUndefined();
    expect(workspaceOf('backend-tools/run.ts', structure)).toBeUndefined();
  });
});
