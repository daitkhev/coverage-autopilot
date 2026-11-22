import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  ARTIFACT_STORE,
  type ArtifactReference,
  type ArtifactStore,
  type SaveArtifactRequest,
} from '#ports/artifact-store.port';
import { JOB_QUEUE } from '#ports/job-queue.port';

describe('ArtifactStore', () => {
  it('should be injected by a token of its own', () => {
    expect(ARTIFACT_STORE.description).toBe('ArtifactStore');
    expect(ARTIFACT_STORE).not.toBe(JOB_QUEUE);
  });

  it('should give a reference that a column of the database can hold', () => {
    expectTypeOf<ArtifactReference>().toEqualTypeOf<string>();
    expectTypeOf<
      ArtifactStore['save']
    >().returns.resolves.toEqualTypeOf<ArtifactReference>();
  });

  it('should take the owner and the label of what it saves', () => {
    expectTypeOf<ArtifactStore['save']>()
      .parameter(0)
      .toEqualTypeOf<SaveArtifactRequest>();
    expectTypeOf<keyof SaveArtifactRequest>().toEqualTypeOf<
      'owner' | 'label' | 'content'
    >();
  });

  it('should read a file that is gone as null', () => {
    expectTypeOf<ArtifactStore['read']>().returns.resolves.toEqualTypeOf<
      string | null
    >();
  });

  it('should say where the file of a reference is without reading it', () => {
    expectTypeOf<ArtifactStore['pathOf']>()
      .parameter(0)
      .toEqualTypeOf<ArtifactReference>();
    expectTypeOf<ArtifactStore['pathOf']>().returns.toEqualTypeOf<string>();
  });
});
