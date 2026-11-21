import { describe, expect, it } from 'vitest';

import { Entity } from '#kernel/primitives/entity';
import { RepositoryId } from '#kernel/primitives/repository-id';

const FIRST = '00000000-0000-4000-8000-000000000001';
const SECOND = '00000000-0000-4000-8000-000000000002';

class Account extends Entity<RepositoryId> {
  public readonly name: string;

  public constructor(id: string, name: string) {
    super(RepositoryId.create(id));
    this.name = name;
  }
}

describe('Entity', () => {
  describe('equals', () => {
    it('should be the same as another with an equal id', () => {
      expect(new Account(FIRST, 'a').equals(new Account(FIRST, 'b'))).toBe(
        true,
      );
    });

    it('should not be the same as another with another id', () => {
      expect(new Account(FIRST, 'a').equals(new Account(SECOND, 'a'))).toBe(
        false,
      );
    });
  });
});
