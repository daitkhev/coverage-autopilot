import { describe, expect, it } from 'vitest';

import { CaptureSteps } from '#coverage/application/commands/capture-snapshot/capture-steps';
import type { JobProgress } from '#ports/job-queue.port';

function watched(): { steps: CaptureSteps; heard: JobProgress[] } {
  const heard: JobProgress[] = [];
  const steps = new CaptureSteps((progress) => {
    heard.push(progress);
  });
  return { steps, heard };
}

function statusesOf(progress: JobProgress | undefined): string[] {
  return (progress?.steps ?? []).map(({ code, status }) => `${code}:${status}`);
}

describe('CaptureSteps', () => {
  describe('begin', () => {
    it('should send every step, with the first one running', () => {
      const { steps, heard } = watched();

      steps.begin('clone');

      expect(statusesOf(heard.at(-1))).toEqual([
        'clone:running',
        'install:pending',
        'test_run:pending',
        'read_report:pending',
      ]);
    });

    it('should pass the running step when the next one begins', () => {
      const { steps, heard } = watched();

      steps.begin('clone');
      steps.begin('install');

      expect(heard).toHaveLength(2);
      expect(statusesOf(heard.at(-1))).toEqual([
        'clone:passed',
        'install:running',
        'test_run:pending',
        'read_report:pending',
      ]);
    });
  });

  describe('pass', () => {
    it('should pass the last running step', () => {
      const { steps, heard } = watched();
      steps.begin('read_report');

      steps.pass();

      expect(statusesOf(heard.at(-1))).toContain('read_report:passed');
    });
  });

  describe('fail', () => {
    it('should fail the running step and leave the rest pending', () => {
      const { steps, heard } = watched();
      steps.begin('clone');
      steps.begin('install');

      steps.fail();

      expect(statusesOf(heard.at(-1))).toEqual([
        'clone:passed',
        'install:failed',
        'test_run:pending',
        'read_report:pending',
      ]);
    });
  });
});
