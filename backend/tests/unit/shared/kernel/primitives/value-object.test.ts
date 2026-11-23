import { describe, expect, it } from 'vitest';

import { CommitSha } from '#kernel/primitives/commit-sha';
import { FilePath } from '#kernel/primitives/file-path';
import { ValueObject } from '#kernel/primitives/value-object';

interface ShapeProps {
  readonly name: string;
  readonly parts: readonly Shape[];
  readonly note?: string;
}

class Shape extends ValueObject<ShapeProps> {
  public constructor(props: ShapeProps) {
    super(props);
  }

  public get name(): string {
    return this.props.name;
  }
}

const leaf = (name: string): Shape => new Shape({ name, parts: [] });

describe('ValueObject', () => {
  describe('equals', () => {
    it('should be equal to another with the same parts', () => {
      expect(leaf('a').equals(leaf('a'))).toBe(true);
    });

    it('should not be equal to another with a different part', () => {
      expect(leaf('a').equals(leaf('b'))).toBe(false);
    });

    it('should not be equal to another class with the same parts', () => {
      const text = 'a'.repeat(40);

      expect(FilePath.create(text).equals(CommitSha.create(text))).toBe(false);
    });

    it('should compare the value objects of a list by their parts', () => {
      const left = new Shape({ name: 'a', parts: [leaf('b')] });
      const right = new Shape({ name: 'a', parts: [leaf('b')] });

      expect(left.equals(right)).toBe(true);
    });

    it('should not be equal when a list differs in length', () => {
      const left = new Shape({ name: 'a', parts: [leaf('b')] });

      expect(left.equals(leaf('a'))).toBe(false);
    });

    it('should not be equal when an item of a list differs', () => {
      const left = new Shape({ name: 'a', parts: [leaf('b')] });
      const right = new Shape({ name: 'a', parts: [leaf('c')] });

      expect(left.equals(right)).toBe(false);
    });

    it('should not be equal when one has a part the other lacks', () => {
      const left = new Shape({ name: 'a', parts: [], note: 'n' });

      expect(left.equals(leaf('a'))).toBe(false);
    });
  });

  describe('when it is made', () => {
    it('should keep its parts frozen', () => {
      const shape = leaf('a');

      expect(Object.isFrozen(Reflect.get(shape, 'props'))).toBe(true);
      expect(shape.name).toBe('a');
    });
  });
});
