import { describe, expect, it } from 'vitest';

import { InvalidStoredJobError } from '#infrastructure/queue/errors/invalid-stored-job.error';
import {
  jobDocumentOf,
  jobKindOf,
  jobProgressOf,
  jobStatusOf,
  progressDocumentOf,
} from '#infrastructure/queue/stored-job-documents';

describe('stored job documents', () => {
  describe('jobDocumentOf', () => {
    it('should read a document of any version as it is', () => {
      expect(jobDocumentOf('{"version":7,"new":{"shape":[1]}}')).toEqual({
        version: 7,
        new: { shape: [1] },
      });
    });

    it.each(['[1]', '"text"', 'null', '{"name":"x"}', '{"version":"1"}'])(
      'should refuse %s, which is not a document with a version',
      (text) => {
        expect(() => jobDocumentOf(text)).toThrow(InvalidStoredJobError);
      },
    );
  });

  describe('jobProgressOf', () => {
    it('should read back what progressDocumentOf wrote', () => {
      const progress = {
        steps: [
          { code: 'clone', status: 'passed' },
          { code: 'mutants', status: 'running', done: 2, total: 5 },
        ],
      } as const;

      expect(jobProgressOf(progressDocumentOf(progress))).toEqual(progress);
    });

    it.each([
      ['another version', '{"version":2,"steps":[]}'],
      ['no list of steps', '{"version":1,"steps":{}}'],
      ['a step with no code', '{"version":1,"steps":[{"status":"passed"}]}'],
      [
        'a step with an unknown status',
        '{"version":1,"steps":[{"code":"x","status":"done"}]}',
      ],
      [
        'a count that is not whole',
        '{"version":1,"steps":[{"code":"x","status":"running","done":0.5}]}',
      ],
      ['a value that is not an object', '[]'],
    ])('should refuse progress with %s', (_, text) => {
      expect(() => jobProgressOf(text)).toThrow(
        new InvalidStoredJobError(
          'The stored progress of a job is not a list of steps of version 1.',
        ),
      );
    });
  });

  describe('jobKindOf', () => {
    it('should read a kind the queue knows', () => {
      expect(jobKindOf('improvement')).toBe('improvement');
    });
  });

  describe('jobStatusOf', () => {
    it('should refuse a status the queue does not know', () => {
      expect(() => jobStatusOf('running')).toThrow(
        new InvalidStoredJobError('"running" is not a status of a job.'),
      );
    });
  });
});
