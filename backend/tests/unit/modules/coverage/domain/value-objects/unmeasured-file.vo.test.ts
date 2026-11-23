import { describe, expect, it } from 'vitest';

import {
  UNMEASURED_REASONS,
  UnmeasuredFile,
} from '#coverage/domain/value-objects/unmeasured-file.vo';
import { FilePath } from '#kernel/primitives/file-path';

describe('UnmeasuredFile', () => {
  describe('create', () => {
    it('should keep the path, the reason and what the tool said', () => {
      const file = UnmeasuredFile.create({
        path: FilePath.create('src/broken.ts'),
        reason: 'parse_failed',
        toolMessage: "')' expected.",
      });

      expect(file.path.value).toBe('src/broken.ts');
      expect(file.reason).toBe('parse_failed');
      expect(file.toolMessage).toBe("')' expected.");
    });

    it('should carry no counters, so it has no percentage', () => {
      const file = UnmeasuredFile.create({
        path: FilePath.create('src/a.ts'),
        reason: 'no_counters',
        toolMessage: null,
      });

      expect(file).not.toHaveProperty('counters');
    });
  });

  describe('UNMEASURED_REASONS', () => {
    it('should be the three cases the two inputs tell apart', () => {
      expect(UNMEASURED_REASONS).toEqual([
        'parse_failed',
        'missing_from_report',
        'no_counters',
      ]);
    });
  });
});
