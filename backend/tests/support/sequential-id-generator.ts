import type { IdGenerator } from '#kernel/id/id-generator';

/** A version 4 UUID with every random digit at zero but the last ones. */
const PREFIX = '00000000-0000-4000-8000-';
const DIGITS = 12;

/**
 * Gives ids in sequence, so a test knows each id before it is made:
 * `00000000-0000-4000-8000-000000000001`, then `...002`, and so on.
 */
export class SequentialIdGenerator implements IdGenerator {
  private count = 0;

  public generate(): string {
    this.count += 1;
    return `${PREFIX}${String(this.count).padStart(DIGITS, '0')}`;
  }
}
