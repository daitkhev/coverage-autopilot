import { describe, expect, it } from 'vitest';

import { mutantAt } from '#tests/support/verification-mutants';
import { mutantOf } from '#verification/application/dto/verification-dto-mapping';
import { InvalidMutantError } from '#verification/domain/errors/invalid-mutant.error';
import { Mutant } from '#verification/domain/value-objects/mutant.vo';

describe('Mutant', () => {
  describe('create', () => {
    it('should keep what the mutant is', () => {
      const mutant = Mutant.create({ ...mutantAt(12), replacement: '' });

      expect(mutant.file.value).toBe('src/used.ts');
      expect(mutant.mutator).toBe('EqualityOperator');
      expect([mutant.startLine, mutant.startColumn]).toEqual([12, 4]);
      expect([mutant.endLine, mutant.endColumn]).toEqual([12, 9]);
      expect(mutant.replacement).toBe('');
    });

    describe('when it names no mutator', () => {
      it('should throw InvalidMutantError', () => {
        expect(() => Mutant.create({ ...mutantAt(1), mutator: '' })).toThrow(
          InvalidMutantError,
        );
      });
    });

    describe('when a place is not a whole number from 0', () => {
      it('should throw InvalidMutantError', () => {
        expect(() =>
          Mutant.create({ ...mutantAt(1), startColumn: -1 }),
        ).toThrow(/lines and columns/u);
      });
    });

    describe('when it ends before it starts', () => {
      it('should throw InvalidMutantError', () => {
        expect(() => Mutant.create({ ...mutantAt(3), endLine: 2 })).toThrow(
          /ends before it starts/u,
        );
        expect(() => Mutant.create({ ...mutantAt(3), endColumn: 1 })).toThrow(
          InvalidMutantError,
        );
      });
    });
  });

  describe('key', () => {
    it('should be the same for the same mutant of two runs', () => {
      expect(mutantOf(mutantAt(7)).key).toBe(mutantOf(mutantAt(7)).key);
    });

    it('should differ for another place or another replacement', () => {
      const mutant = mutantOf(mutantAt(7));

      expect(mutantOf(mutantAt(8)).key).not.toBe(mutant.key);
      expect(mutantOf({ ...mutantAt(7), replacement: 'a < b' }).key).not.toBe(
        mutant.key,
      );
    });
  });
});
