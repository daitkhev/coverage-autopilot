import { describe, expect, it } from 'vitest';

import {
  accessCheckNameSchema,
  accessCheckStatusSchema,
  fileStateSchema,
  generationOutcomeSchema,
  generatorCliSchema,
  improvementStatusSchema,
  scanStatusSchema,
  stepStatusSchema,
  unmeasuredReasonSchema,
  verdictSchema,
  waitingForSchema,
} from '@coverage-autopilot/api-contracts/statuses';

import {
  ACCESS_CHECK_STATUS,
  ACCESS_STEP_WORDS,
  ATTEMPT_VERDICT,
  attemptLook,
  CHECK_STATUS,
  FILE_STATE,
  GENERATION_OUTCOME,
  GENERATOR_WORDS,
  IMPROVEMENT_STATUS,
  NO_VERDICT,
  SCAN_STATUS,
  SERVICE_STATE,
  type StatusLook,
  unjudgedWords,
  UNMEASURED_REASON,
  WAITING_FOR,
  waitWords,
} from '#theme/status';

const TABLES: Readonly<Record<string, Readonly<Record<string, StatusLook>>>> = {
  IMPROVEMENT_STATUS,
  SCAN_STATUS,
  ACCESS_CHECK_STATUS,
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

/** A table of the client beside the list of the contract it draws. */
const CONTRACT = [
  {
    table: 'IMPROVEMENT_STATUS',
    rows: IMPROVEMENT_STATUS,
    schema: improvementStatusSchema,
  },
  { table: 'SCAN_STATUS', rows: SCAN_STATUS, schema: scanStatusSchema },
  {
    table: 'ACCESS_CHECK_STATUS',
    rows: ACCESS_CHECK_STATUS,
    schema: accessCheckStatusSchema,
  },
  { table: 'ATTEMPT_VERDICT', rows: ATTEMPT_VERDICT, schema: verdictSchema },
  { table: 'CHECK_STATUS', rows: CHECK_STATUS, schema: stepStatusSchema },
  { table: 'FILE_STATE', rows: FILE_STATE, schema: fileStateSchema },
  {
    table: 'UNMEASURED_REASON',
    rows: UNMEASURED_REASON,
    schema: unmeasuredReasonSchema,
  },
  { table: 'WAITING_FOR', rows: WAITING_FOR, schema: waitingForSchema },
  {
    table: 'GENERATION_OUTCOME',
    rows: GENERATION_OUTCOME,
    schema: generationOutcomeSchema,
  },
  {
    table: 'GENERATOR_WORDS',
    rows: GENERATOR_WORDS,
    schema: generatorCliSchema,
  },
  {
    table: 'ACCESS_STEP_WORDS',
    rows: ACCESS_STEP_WORDS,
    schema: accessCheckNameSchema,
  },
];

describe('the status tables and the contract', () => {
  it.each(CONTRACT)(
    'should hold in $table every value of the contract and no other',
    ({ rows, schema }) => {
      expect(Object.keys(rows).sort()).toEqual([...schema.options].sort());
    },
  );
});

describe('IMPROVEMENT_STATUS', () => {
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

describe('SCAN_STATUS', () => {
  it('should say a scan in the words of an improvement', () => {
    const words = new Set(
      Object.values(IMPROVEMENT_STATUS).map((look) => look.word),
    );

    for (const look of Object.values(SCAN_STATUS)) {
      expect(words).toContain(look.word);
    }
  });
});

describe('ACCESS_CHECK_STATUS', () => {
  it('should draw a refused step in red, and a step never reached dim', () => {
    expect(ACCESS_CHECK_STATUS.failed.role).toBe('danger');
    expect(ACCESS_CHECK_STATUS.not_run.role).toBe('secondary');
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

describe('waitWords', () => {
  const NO_WAIT = {
    status: 'created',
    waitingFor: null,
    resumesAt: null,
  } as const;

  it.each([
    [NO_WAIT, 'for its turn'],
    [{ ...NO_WAIT, waitingFor: 'worker' } as const, 'for a free worker'],
    [
      {
        status: 'waiting_for_limit',
        waitingFor: null,
        resumesAt: '2026-11-21T16:00:00.000Z',
      } as const,
      'for the limit until 16:00',
    ],
  ])('should say what %o waits for', (improvement, words) => {
    expect(waitWords(improvement, 'UTC')).toBe(words);
  });
});

describe('attemptLook', () => {
  it('should tell a running, a judged and an unjudged attempt apart', () => {
    expect(attemptLook({ status: 'open', report: null })).toBe(
      CHECK_STATUS.running,
    );
    expect(attemptLook({ status: 'closed', report: null })).toBe(NO_VERDICT);
  });
});

describe('unjudgedWords', () => {
  it('should say why an attempt has no verdict, in plain words', () => {
    expect(unjudgedWords('no_changes')).toBe('the generator changed nothing');
    expect(unjudgedWords(null)).toBe('stopped before a test was written');
  });
});
