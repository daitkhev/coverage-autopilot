import { describe, expect, it } from 'vitest';

import { CommitSha } from '#kernel/primitives/commit-sha';
import { RevisionAssessment } from '#repositories/domain/value-objects/revision-assessment.vo';

const SNAPSHOT = CommitSha.create('a'.repeat(40));
const HEAD = CommitSha.create('b'.repeat(40));

describe('RevisionAssessment', () => {
  describe('of', () => {
    it('should be current when the head is the snapshot commit', () => {
      const assessment = RevisionAssessment.of(SNAPSHOT, {
        headCommit: SNAPSHOT,
        snapshotIsAncestor: true,
        targetFileChanged: false,
      });

      expect(assessment.outcome).toBe('current');
      expect(assessment.headCommit).toBe(SNAPSHOT);
    });

    it('should be unchanged when the head moved and the file is the same', () => {
      const assessment = RevisionAssessment.of(SNAPSHOT, {
        headCommit: HEAD,
        snapshotIsAncestor: true,
        targetFileChanged: false,
      });

      expect(assessment.outcome).toBe('unchanged');
      expect(assessment.headCommit).toBe(HEAD);
    });

    it('should be stale when the head moved and the file changed', () => {
      expect(
        RevisionAssessment.of(SNAPSHOT, {
          headCommit: HEAD,
          snapshotIsAncestor: true,
          targetFileChanged: true,
        }).outcome,
      ).toBe('stale');
    });

    it('should be diverged when the snapshot commit is not an ancestor', () => {
      expect(
        RevisionAssessment.of(SNAPSHOT, {
          headCommit: HEAD,
          snapshotIsAncestor: false,
        }).outcome,
      ).toBe('diverged');
    });
  });
});
