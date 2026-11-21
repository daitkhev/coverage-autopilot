import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { RandomUuidGenerator } from '#infrastructure/id/random-uuid-generator.adapter';
import { ID_GENERATOR, type IdGenerator } from '#kernel/id/id-generator';
import { RepositoryId } from '#kernel/primitives/repository-id';
import { SequentialIdGenerator } from '#tests/support/sequential-id-generator';

const COUNT = 1_000;

function idsOf(generator: IdGenerator): string[] {
  return Array.from({ length: COUNT }, () => generator.generate());
}

describe('RandomUuidGenerator', () => {
  describe('generate', () => {
    it('should make ids the kernel accepts, never the same twice', () => {
      const ids = idsOf(new RandomUuidGenerator());

      expect(new Set(ids).size).toBe(COUNT);
      for (const id of ids) {
        expect(RepositoryId.create(id).value).toBe(id);
      }
    });
  });

  describe('when it is injected by its token', () => {
    it('should be the id generator of the service', async () => {
      const module = await Test.createTestingModule({
        providers: [{ provide: ID_GENERATOR, useClass: RandomUuidGenerator }],
      }).compile();

      expect(module.get<IdGenerator>(ID_GENERATOR)).toBeInstanceOf(
        RandomUuidGenerator,
      );
    });
  });
});

describe('SequentialIdGenerator', () => {
  it('should make the ids of a test in order, as the kernel accepts them', () => {
    const ids = idsOf(new SequentialIdGenerator()).slice(0, 2);

    expect(ids).toEqual([
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
    ]);
    expect(RepositoryId.create(ids[1] ?? '').value).toBe(ids[1]);
  });
});
