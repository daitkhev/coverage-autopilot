import type { ValueObject } from '#kernel/primitives/value-object';

/**
 * An object with an identity: two of them are the same when their ids are,
 * whatever else they hold. The type of the id keeps entities of different
 * kinds from being compared.
 */
export abstract class Entity<Id extends ValueObject<object>> {
  public readonly id: Id;

  protected constructor(id: Id) {
    this.id = id;
  }

  public equals(other: Entity<Id>): boolean {
    return other.id.equals(this.id);
  }
}
