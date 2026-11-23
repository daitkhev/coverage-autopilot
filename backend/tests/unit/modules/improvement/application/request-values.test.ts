import { describe, expect, it } from 'vitest';

import {
  requestValueOf,
  requestValueOrNull,
} from '#improvement/application/request-values';
import { ImprovementId } from '#improvement/domain/value-objects/improvement-id.vo';
import { FilePath } from '#kernel/primitives/file-path';
import { IMPROVEMENT_ID } from '#tests/support/improvement-values';

describe('requestValueOf', () => {
  it('should give the value that was made', () => {
    expect(requestValueOf(() => ImprovementId.create(IMPROVEMENT_ID))).toEqual({
      outcome: 'valid',
      value: ImprovementId.create(IMPROVEMENT_ID),
    });
  });

  describe('when the value breaks a rule of the domain', () => {
    it('should give the words of the rule as a value', () => {
      expect(requestValueOf(() => FilePath.create('/etc/passwd'))).toEqual({
        outcome: 'invalid',
        message:
          '"/etc/passwd" is not a path as git stores it: it is absolute.',
      });
    });
  });

  describe('when making the value fails for another cause', () => {
    it('should throw the fault on', () => {
      const fault = new TypeError('The value is not readable.');

      expect(() =>
        requestValueOf(() => {
          throw fault;
        }),
      ).toThrow(fault);
    });
  });
});

describe('requestValueOrNull', () => {
  it('should give the value that was made', () => {
    expect(
      requestValueOrNull(() => ImprovementId.create(IMPROVEMENT_ID)),
    ).toEqual(ImprovementId.create(IMPROVEMENT_ID));
  });

  describe('when the value breaks a rule of the domain', () => {
    it('should give null', () => {
      expect(requestValueOrNull(() => ImprovementId.create('42'))).toBeNull();
    });
  });
});
