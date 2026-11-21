import { describe, expect, it } from 'vitest';

import {
  ATTEMPT_VERDICT,
  CHECK_STATUS,
  FILE_STATE,
  IMPROVEMENT_STATUS,
  SERVICE_STATE,
  type StatusLook,
  UNMEASURED_REASON,
} from '#theme/status';

const TABLES: Readonly<Record<string, Readonly<Record<string, StatusLook>>>> = {
  IMPROVEMENT_STATUS,
  ATTEMPT_VERDICT,
  CHECK_STATUS,
  FILE_STATE,
  SERVICE_STATE,
};

const ROWS = Object.entries(TABLES).flatMap(([table, rows]) =>
  Object.entries(rows).map(([status, look]) => ({ table, status, look })),
);

describe('the status tables', () => {
  it.each(ROWS)(
    'should give $table.$status a glyph, a word and a role',
    ({ look }) => {
      expect(look.glyph).not.toBe('');
      expect(look.word.trim()).not.toBe('');
      expect(look.role).not.toBe('');
    },
  );
});

describe('IMPROVEMENT_STATUS', () => {
  it('should hold every status of an improvement', () => {
    expect(Object.keys(IMPROVEMENT_STATUS)).toEqual([
      'created',
      'analyzing',
      'generating',
      'verifying',
      'publishing',
      'awaiting_approval',
      'completed',
      'failed',
      'cancelled',
      'skipped',
    ]);
  });

  it('should tell a cancelled improvement from a skipped one', () => {
    const { cancelled, skipped } = IMPROVEMENT_STATUS;

    expect(cancelled.glyph).not.toBe(skipped.glyph);
    expect(cancelled.word).not.toBe(skipped.word);
  });

  it('should keep red for the failure alone', () => {
    const red = Object.entries(IMPROVEMENT_STATUS)
      .filter(([, look]) => look.role === 'danger')
      .map(([status]) => status);

    expect(red).toEqual(['failed']);
  });
});

describe('ATTEMPT_VERDICT', () => {
  it('should draw a rejected attempt in yellow, not red', () => {
    expect(ATTEMPT_VERDICT.rejected.role).toBe('warning');
  });
});

describe('CHECK_STATUS', () => {
  it('should draw a failed check in yellow, not red', () => {
    expect(CHECK_STATUS.failed.role).toBe('warning');
  });
});

describe('FILE_STATE', () => {
  it('should give a file without numbers a figure and no percentage', () => {
    expect(FILE_STATE.unmeasured.figure).toBe('N/A');
    expect(FILE_STATE.no_executable_code.figure).toBe('0/0');
    expect(FILE_STATE.measured.figure).toBeUndefined();
  });
});

describe('UNMEASURED_REASON', () => {
  it.each(Object.entries(UNMEASURED_REASON))(
    'should say %s in plain words with the next step',
    (_reason, words) => {
      expect(words.said).not.toMatch(/_/u);
      expect(words.next).toMatch(/\.$/u);
    },
  );
});
