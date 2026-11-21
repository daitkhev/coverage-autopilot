function sameValue(left: unknown, right: unknown): boolean {
  if (left instanceof ValueObject && right instanceof ValueObject) {
    return left.equals(right);
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((item, index) => sameValue(item, right[index]))
    );
  }
  return Object.is(left, right);
}

/**
 * A value with no identity: two of them are equal when their parts are.
 * The parts are frozen, so a value object never changes after it is made.
 */
export abstract class ValueObject<Props extends object> {
  protected readonly props: Readonly<Props>;

  protected constructor(props: Props) {
    this.props = Object.freeze({ ...props });
  }

  public equals(other: ValueObject<Props>): boolean {
    if (other.constructor !== this.constructor) {
      return false;
    }
    const mine = Object.entries(this.props);
    const theirs = new Map(Object.entries(other.props));
    return (
      mine.length === theirs.size &&
      mine.every(([key, value]) => sameValue(value, theirs.get(key)))
    );
  }
}
