import { describe, expect, it } from 'vitest';

import { reportOf } from '#harness/mutation/report';
import { HarnessError } from '#harness/shared/harness.error';

describe('reportOf', () => {
  it('should read the files and the status of every mutant', () => {
    const report = reportOf({
      schemaVersion: '1.0',
      files: {
        'harness/a.ts': {
          mutants: [
            { id: '0', status: 'Killed', mutatorName: 'StringLiteral' },
            { id: '1', status: 'Survived' },
          ],
        },
        'harness/types.ts': { mutants: [] },
      },
    });

    expect(report).toEqual({
      files: ['harness/a.ts', 'harness/types.ts'],
      mutants: [
        { file: 'harness/a.ts', status: 'Killed' },
        { file: 'harness/a.ts', status: 'Survived' },
      ],
    });
  });

  it.each([
    ['no files', { schemaVersion: '1.0' }],
    ['files that are a list', { files: [] }],
    ['a file with no mutants', { files: { 'a.ts': {} } }],
    ['a file that is not an object', { files: { 'a.ts': 'text' } }],
    ['a mutant with no status', { files: { 'a.ts': { mutants: [{}] } } }],
    ['a mutant that is not an object', { files: { 'a.ts': { mutants: [1] } } }],
    [
      'a status that is not text',
      { files: { 'a.ts': { mutants: [{ status: 1 }] } } },
    ],
  ])('should refuse a report with %s', (_, parsed) => {
    expect(() => reportOf(parsed)).toThrow(HarnessError);
  });
});
