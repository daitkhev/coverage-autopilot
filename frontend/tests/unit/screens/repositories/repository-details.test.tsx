import { describe, expect, it } from 'vitest';

import type { Repository } from '@coverage-autopilot/api-contracts/repositories';

import { RepositoryDetails } from '#screens/repositories/repository-details';
import type { RepositoryWork } from '#screens/repositories/repository-listing';
import { answered, refused, SAMPLE_NOW } from '#tests/support/fake-service-api';
import { IMPROVEMENT_LIST } from '#tests/support/sample-improvements';
import {
  NEVER_SCANNED_REPOSITORY,
  SCANNED_REPOSITORY,
} from '#tests/support/sample-repositories';
import { drawnAt } from '#tests/support/terminal-text';
import { BAR_CELLS } from '#theme/widths';

/** The inner width of the panel beside the list at 112 columns. */
const PANEL_COLUMNS = 40;

function draw({
  repository = SCANNED_REPOSITORY,
  starting = false,
  work,
}: {
  readonly repository?: Repository;
  readonly starting?: boolean;
  readonly work?: RepositoryWork;
}): string {
  return drawnAt(
    <RepositoryDetails
      row={{ repository, scan: undefined }}
      starting={starting}
      work={work}
      now={SAMPLE_NOW}
      cells={BAR_CELLS.detail}
    />,
    PANEL_COLUMNS,
  );
}

describe('RepositoryDetails', () => {
  it('should show the four counters and how the files divide', () => {
    const drawn = draw({});

    expect(drawn).toContain('threshold 80.0% of lines');
    expect(drawn).toMatch(/Branches +━+─+┼── {3}61\.3%/u);
    expect(drawn).toContain('12 below 80.0% · 30 at or above');
    expect(drawn).toContain('2 not measured · 4 no code');
  });

  it('should show the latest work of the repository', () => {
    const drawn = draw({
      work: {
        repositoryId: SCANNED_REPOSITORY.id,
        answer: answered(IMPROVEMENT_LIST),
      },
    });

    expect(drawn).toMatch(/○ WAIT +src\/api\/refund\.ts +30s/u);
  });

  it('should not show the work of the repository chosen before', () => {
    const drawn = draw({
      work: {
        repositoryId: NEVER_SCANNED_REPOSITORY.id,
        answer: answered(IMPROVEMENT_LIST),
      },
    });

    expect(drawn).toContain('asking the service');
    expect(drawn).not.toContain('WAIT');
  });

  it('should say the work of a repository that has none', () => {
    const drawn = draw({
      repository: NEVER_SCANNED_REPOSITORY,
      work: {
        repositoryId: NEVER_SCANNED_REPOSITORY.id,
        answer: answered({ items: [] }),
      },
    });

    expect(drawn).toContain('main · connected 1m ago');
    expect(drawn).toContain('Not scanned yet. Press s to scan it.');
    expect(drawn).toContain('No improvements yet.');
  });

  it('should say what the service refused the work with', () => {
    const drawn = draw({
      work: {
        repositoryId: SCANNED_REPOSITORY.id,
        answer: refused(500, {
          error: 'internal_error',
          message: 'The work is lost.',
        }),
      },
    });

    expect(drawn).toContain('The work is lost.');
  });

  describe('when a scan was started here', () => {
    it('should say the first scan runs, and not offer another', () => {
      const drawn = draw({
        repository: NEVER_SCANNED_REPOSITORY,
        starting: true,
      });

      expect(drawn).toContain('main · a scan waits for its turn');
      expect(drawn).toContain('The first scan runs.');
      expect(drawn).not.toContain('Press s');
    });

    it('should keep the counters of the last snapshot meanwhile', () => {
      const drawn = draw({ starting: true });

      expect(drawn).toContain('a scan waits for its turn');
      expect(drawn).toContain('threshold 80.0% of lines');
    });
  });
});
