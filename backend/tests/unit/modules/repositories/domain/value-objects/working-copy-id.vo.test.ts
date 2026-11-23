import { describe, expect, it } from 'vitest';

import { InvalidWorkingCopyIdError } from '#repositories/domain/errors/invalid-working-copy-id.error';
import { WorkingCopyId } from '#repositories/domain/value-objects/working-copy-id.vo';

describe('WorkingCopyId', () => {
  describe('fromPurpose', () => {
    it('should keep lower-case letters, digits and hyphens as they are', () => {
      expect(WorkingCopyId.fromPurpose('scan-7').value).toBe('scan-7');
    });

    it('should write every other byte as an underscore and two hex digits', () => {
      expect(WorkingCopyId.fromPurpose('improvement:1:attempt:2').value).toBe(
        'improvement_3a1_3aattempt_3a2',
      );
    });

    it('should write each byte of a character beyond ASCII', () => {
      expect(WorkingCopyId.fromPurpose('é').value).toBe('_c3_a9');
    });

    it.each([
      ['letters that differ in case only', 'Scan', 'scan'],
      ['an underscore and its escape', '_3a', ':'],
      ['a dot and a slash', 'a.b', 'a/b'],
    ])('should give two purposes two ids: %s', (_case, first, second) => {
      expect(WorkingCopyId.fromPurpose(first).value).not.toBe(
        WorkingCopyId.fromPurpose(second).value,
      );
    });

    it.each(['..', '../../etc', '/tmp/x'])(
      'should keep %s inside the root of the copies',
      (purpose) => {
        expect(WorkingCopyId.fromPurpose(purpose).value).toMatch(
          /^[a-z0-9_-]+$/u,
        );
      },
    );

    describe('when the purpose cannot name a folder', () => {
      it.each([
        ['an empty purpose', ''],
        ['a purpose that is too long', 'a'.repeat(256)],
        ['a purpose too long once escaped', ':'.repeat(86)],
      ])('should throw InvalidWorkingCopyIdError for %s', (_case, purpose) => {
        expect(() => WorkingCopyId.fromPurpose(purpose)).toThrow(
          InvalidWorkingCopyIdError,
        );
      });
    });
  });

  describe('parse', () => {
    it('should take back an id that fromPurpose made', () => {
      const made = WorkingCopyId.fromPurpose('scan:00000000-0000-4000');

      expect(WorkingCopyId.parse(made.value).equals(made)).toBe(true);
    });

    describe('when the text is not an id', () => {
      it.each([
        ['an empty text', ''],
        ['a parent folder', '..'],
        ['a path', 'a/b'],
        ['a capital letter', 'Scan'],
        ['a broken escape', 'scan_3'],
        ['an escape in capitals', 'scan_3A'],
        ['a text that is too long', 'a'.repeat(256)],
      ])('should throw InvalidWorkingCopyIdError for %s', (_case, text) => {
        expect(() => WorkingCopyId.parse(text)).toThrow(
          InvalidWorkingCopyIdError,
        );
      });
    });
  });

  describe('InvalidWorkingCopyIdError', () => {
    it('should be a fault of the domain that is not retried', () => {
      expect(new InvalidWorkingCopyIdError('x')).toMatchObject({
        name: 'InvalidWorkingCopyIdError',
        code: 'invalid_working_copy_id',
        retryable: false,
      });
    });
  });
});
