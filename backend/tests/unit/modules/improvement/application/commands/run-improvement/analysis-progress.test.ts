import { describe, expect, it } from 'vitest';

import { AnalysisProgress } from '#improvement/application/commands/run-improvement/analysis-progress';
import type { JobProgress } from '#ports/job-queue.port';

function progressOf() {
  const reports: JobProgress[] = [];
  const progress = new AnalysisProgress({
    reportProgress: (report) => {
      reports.push(report);
    },
  });
  const statuses = () => reports.at(-1)?.steps.map(({ status }) => status);
  return { progress, reports, statuses };
}

describe('AnalysisProgress', () => {
  it('should report every step of the phase as pending when it begins', () => {
    const { progress, reports } = progressOf();

    progress.begin();

    expect(reports).toEqual([
      {
        steps: [
          { code: 'revision_check', status: 'pending' },
          { code: 'fresh_snapshot', status: 'pending' },
          { code: 'prepare', status: 'pending' },
          { code: 'type_check', status: 'pending' },
          { code: 'existing_tests', status: 'pending' },
          { code: 'mutation_baseline', status: 'pending' },
        ],
      },
    ]);
  });

  it('should end the step that started last', () => {
    const { progress, statuses } = progressOf();

    progress.start('revision_check');
    progress.pass();
    progress.start('fresh_snapshot');
    progress.fail();

    expect(statuses()).toEqual([
      'passed',
      'failed',
      'pending',
      'pending',
      'pending',
      'pending',
    ]);
  });

  describe('hear', () => {
    it('should take the steps of the gate as they start and end', () => {
      const { progress, statuses } = progressOf();

      progress.hear({ step: 'prepare', status: 'running' });
      expect(statuses()?.[2]).toBe('running');

      progress.hear({ step: 'prepare', status: 'done' });
      progress.hear({ step: 'type_check', status: 'running' });
      expect(statuses()?.slice(2, 4)).toEqual(['passed', 'running']);
    });

    it('should fail the step of the gate it heard of last', () => {
      const { progress, statuses } = progressOf();

      progress.hear({ step: 'prepare', status: 'running' });
      progress.hear({ step: 'prepare', status: 'done' });
      progress.fail();

      expect(statuses()?.[2]).toBe('failed');
    });
  });
});
