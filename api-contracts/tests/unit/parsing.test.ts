import { describe, expect, it } from 'vitest';

import { ContractMismatchError, parseAs } from '#api-contracts/parsing';
import { progressSchema } from '#api-contracts/progress';

const UPDATED_AT = '2026-03-01T10:00:00.000Z';

function mismatchOf(value: unknown): ContractMismatchError {
  try {
    parseAs(progressSchema, value);
  } catch (error) {
    if (error instanceof ContractMismatchError) {
      return error;
    }
  }
  throw new Error('The value matched its schema.');
}

describe('parseAs', () => {
  it('should give the value as the schema reads it', () => {
    const value = {
      steps: [{ code: 'install', status: 'running' }],
      updatedAt: UPDATED_AT,
    };

    expect(parseAs(progressSchema, value)).toEqual(value);
  });

  describe('when the value does not match', () => {
    it('should name every place and the rule it broke', () => {
      const mismatch = mismatchOf({
        steps: [{ code: '', status: 'running' }],
        updatedAt: 7,
      });

      expect(mismatch.issues).toEqual([
        { path: 'steps.0.code', code: 'too_small' },
        { path: 'updatedAt', code: 'invalid_type' },
      ]);
    });

    it('should say so in one sentence for a person', () => {
      const mismatch = mismatchOf({ steps: [], updatedAt: 7 });

      expect(mismatch.message).toBe(
        'It does not match its schema. updatedAt: invalid_type.',
      );
    });

    it('should name the value as a whole when it has no place', () => {
      expect(mismatchOf('text').message).toBe(
        'It does not match its schema. the value: invalid_type.',
      );
    });

    it('should never repeat the value, which may be a secret', () => {
      const secret = 'a-token-nobody-may-read';
      const mismatch = mismatchOf({ steps: [], updatedAt: secret });

      expect(JSON.stringify([mismatch.message, mismatch.issues])).not.toContain(
        secret,
      );
    });
  });
});
