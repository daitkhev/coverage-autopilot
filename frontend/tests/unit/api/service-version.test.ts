import { describe, expect, it } from 'vitest';

import { ContractMismatchError } from '@coverage-autopilot/api-contracts/parsing';

import { isIdle, versionOf } from '#api/service-version';
import { BUSY_HEALTH, IDLE_HEALTH } from '#tests/support/sample-repositories';

function replyOf(body: unknown): { status: number; text: string } {
  return { status: 200, text: JSON.stringify(body) };
}

describe('versionOf', () => {
  it('should read the version and the work of a health of this contract', () => {
    expect(versionOf(replyOf(IDLE_HEALTH))).toEqual({
      contractVersion: IDLE_HEALTH.contractVersion,
      activeWork: IDLE_HEALTH.activeWork,
    });
  });

  describe('when the rest of the health is of another shape', () => {
    it('should read the two fields alone', () => {
      const later = {
        contractVersion: 99,
        activeWork: { scans: 1, improvements: 0 },
        aFieldOfLater: { nested: true },
      };

      expect(versionOf(replyOf(later))).toEqual({
        contractVersion: 99,
        activeWork: { scans: 1, improvements: 0 },
      });
    });
  });

  describe('when the health lacks one of the two', () => {
    it('should throw a mismatch of the contract', () => {
      expect(() => versionOf(replyOf({ contractVersion: 2 }))).toThrow(
        ContractMismatchError,
      );
      expect(() => versionOf({ status: 200, text: 'not json' })).toThrow(
        ContractMismatchError,
      );
    });
  });
});

describe('isIdle', () => {
  it('should be idle with no scan and no improvement running', () => {
    expect(isIdle(IDLE_HEALTH)).toBe(true);
  });

  it('should not be idle while a scan or an improvement runs', () => {
    expect(isIdle(BUSY_HEALTH)).toBe(false);
    expect(
      isIdle({ ...IDLE_HEALTH, activeWork: { scans: 0, improvements: 1 } }),
    ).toBe(false);
  });
});
