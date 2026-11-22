import type { ReactNode } from 'react';
import { afterAll, describe, expect, it, vi } from 'vitest';

import type { Problem } from '#components/problem-details';
import type { DatedRequest } from '#hooks/use-dated-request';
import type { ConnectState } from '#screens/repositories/connect-dialog-view';
import type { ConnectPhase } from '#screens/repositories/connect-flow';
import {
  RepositoriesView,
  visibleRowsOf,
} from '#screens/repositories/repositories-view';
import {
  type RepositoryListing,
  type RepositoryRow,
  type RepositoryWork,
  rowsOf,
} from '#screens/repositories/repository-listing';
import {
  answered as serviceAnswered,
  SAMPLE_NOW,
} from '#tests/support/fake-service-api';
import {
  NARROW,
  sampleFrame,
  SECTION,
  SIZES,
  WIDE,
} from '#tests/support/sample-frame';
import { IMPROVEMENT_LIST } from '#tests/support/sample-improvements';
import {
  ACCESS_REFUSED,
  NEVER_SCANNED_REPOSITORY,
  OUTDATED_REPOSITORY,
  SCAN_BY_STATUS,
  SCANNED_REPOSITORY,
  SCANNING_REPOSITORY,
} from '#tests/support/sample-repositories';
import { repositoryActionsAt } from '#tests/support/still-ways';
import {
  drawnAt,
  drawnWith,
  plainText,
  styledAt,
  USUAL_COLUMNS,
  widestLine,
} from '#tests/support/terminal-text';
import type { TerminalSize } from '#theme/widths';

/** Colour is forced on, so turning it off in the theme is what removes it. */
vi.hoisted(() => {
  vi.stubEnv('FORCE_COLOR', '1');
});
afterAll(() => {
  vi.unstubAllEnvs();
});

const ESCAPE = '\u001B';
const COLOUR_CODE = new RegExp(`${ESCAPE}\\[(3[0-9]|9[0-7])m`, 'u');
const SECOND_AGO = '2026-11-21T14:04:59.000Z';
const NO_START: ReadonlySet<string> = new Set();

const ROWS: readonly RepositoryRow[] = [
  { repository: SCANNED_REPOSITORY, scan: undefined },
  { repository: SCANNING_REPOSITORY, scan: SCAN_BY_STATUS.running },
  { repository: OUTDATED_REPOSITORY, scan: undefined },
  { repository: NEVER_SCANNED_REPOSITORY, scan: undefined },
];

const PAYMENTS_WORK: RepositoryWork = {
  repositoryId: SCANNED_REPOSITORY.id,
  answer: serviceAnswered(IMPROVEMENT_LIST),
};

function answered(
  rows: readonly RepositoryRow[] = ROWS,
): DatedRequest<RepositoryListing> {
  return {
    answer: { outcome: 'answered', rows, asked: 1 },
    answeredAt: SECOND_AGO,
    stale: false,
    failure: undefined,
  };
}

function dialogAt(phase: ConnectPhase): ConnectState {
  return { id: 1, url: 'https://github.com/example/notifier', phase };
}

function view({
  listing = answered(),
  work = PAYMENTS_WORK,
  problem,
  index = 0,
  size = WIDE,
  focused = 'list',
  starting = NO_START,
  notice,
  dialog,
}: {
  readonly listing?: DatedRequest<RepositoryListing>;
  readonly work?: RepositoryWork;
  readonly problem?: Problem;
  readonly index?: number;
  readonly size?: TerminalSize;
  readonly focused?: 'list' | 'details';
  readonly starting?: ReadonlySet<string>;
  readonly notice?: string;
  readonly dialog?: ConnectState;
}): ReactNode {
  return (
    <RepositoriesView
      frame={sampleFrame(size, SECTION.repositories)}
      listing={listing}
      work={work}
      problem={problem}
      now={SAMPLE_NOW}
      position={{ index, offset: 0 }}
      visible={visibleRowsOf(size)}
      focused={focused}
      starting={starting}
      notice={notice}
      connect={
        dialog === undefined
          ? undefined
          : {
              state: dialog,
              onChange: vi.fn(),
              onConfirm: vi.fn(),
              onClose: vi.fn(),
            }
      }
      actions={repositoryActionsAt(rowsOf(listing.answer), starting, {
        index,
        focused,
        size,
      })}
    />
  );
}

function draw(parts: Parameters<typeof view>[0] = {}): string {
  return drawnAt(view(parts), parts.size?.columns ?? USUAL_COLUMNS);
}

const ACCESS_REFUSED_PHASE: ConnectPhase = {
  step: 'refused',
  refusal: {
    kind: 'access',
    repository: NEVER_SCANNED_REPOSITORY,
    check: ACCESS_REFUSED,
  },
};

describe('RepositoriesView', () => {
  it('should list the repositories with the first chosen', () => {
    expect(draw()).toMatchSnapshot();
  });

  it('should say what is known of each repository on its second line', () => {
    const drawn = draw();

    expect(drawn).toMatch(/main · 4f2a9c1 · scanned 2h ago/u);
    expect(drawn).toContain('main · running the tests · 40s · updated 1s ago');
    expect(drawn).toContain('outdated: main moved since the scan');
    expect(drawn).toContain('main · press s to scan');
  });

  it('should mark a running scan whose step was not written for long', () => {
    const scan = SCAN_BY_STATUS.running;
    const progress = scan.progress ?? { steps: [], updatedAt: '' };
    const old = {
      ...scan,
      progress: { ...progress, updatedAt: '2026-11-21T14:04:00.000Z' },
    };
    const drawn = draw({
      listing: answered([{ repository: SCANNING_REPOSITORY, scan: old }]),
    });

    expect(drawn).toContain('! updated 1m ago');
  });

  it('should say a scan that has not started waits for its turn', () => {
    const drawn = draw({
      listing: answered([
        { repository: SCANNING_REPOSITORY, scan: SCAN_BY_STATUS.queued },
        { repository: SCANNED_REPOSITORY, scan: undefined },
      ]),
      starting: new Set([SCANNED_REPOSITORY.id]),
    });

    // Both rows, and the panel of the chosen one.
    expect(drawn.match(/a scan waits for its turn/gu)).toHaveLength(3);
    expect(drawn).toContain('2 scans running');
  });

  describe('when another repository is chosen', () => {
    it('should show one that runs a scan without the key to scan it', () => {
      const drawn = draw({ index: 1, focused: 'details' });

      expect(drawn).toContain('example/gateway');
      expect(drawn).toContain('The first scan runs.');
      expect(drawn).not.toContain('Press s to scan it.');
      expect(drawn).toContain('asking the service');
    });
  });

  describe('when no answer came yet', () => {
    it('should draw the panels empty and say it asks the service', () => {
      expect(
        draw({
          listing: {
            answer: undefined,
            answeredAt: undefined,
            stale: false,
            failure: undefined,
          },
        }),
      ).toMatchSnapshot();
    });
  });

  describe('when no repository is connected', () => {
    it('should say so in one sentence with the key that changes it', () => {
      const drawn = draw({ listing: answered([]) });

      expect(drawn).toContain('No repositories yet. Press a to add one.');
      expect(drawn).not.toContain('row 1 of');
      expect(drawn).not.toContain('enter open');
    });
  });

  describe('when the last request failed', () => {
    it('should keep the last list and say it is not fresh', () => {
      expect(
        draw({ listing: { ...answered(), stale: true } }),
      ).toMatchSnapshot();
    });

    it('should show a fault that is not a service that is down', () => {
      const drawn = draw({
        listing: { ...answered(), stale: true },
        problem: {
          kind: 'fault',
          fault: new TypeError('The answer does not match its schema.'),
        },
      });

      expect(drawn).toContain('THE CLIENT SAID');
    });

    it('should show what the service refused the list with', () => {
      const LOST = {
        error: 'internal_error',
        message: 'The list is lost.',
      } as const;
      const drawn = draw({
        listing: {
          ...answered(),
          answer: { outcome: 'refused', error: LOST, asked: 1 },
        },
        problem: { kind: 'refused', error: LOST },
      });

      expect(drawn).toContain('THE SERVICE ANSWERED');
      expect(drawn).not.toContain('No repositories yet.');
    });
  });

  describe('when a notice was given', () => {
    it('should show it above the footer', () => {
      expect(draw({ notice: 'example/notifier is connected.' })).toContain(
        'example/notifier is connected.',
      );
    });
  });

  describe('when the connect dialog is open', () => {
    it('should ask for the address', () => {
      expect(draw({ dialog: dialogAt({ step: 'editing' }) })).toMatchSnapshot();
    });

    it('should say in the footer where it stands, with its keys', () => {
      const drawn = draw({
        dialog: dialogAt({ step: 'connecting', since: SECOND_AGO }),
      });

      expect(drawn).toMatch(
        /Repositories · reading https:\/\/github\.com\/example\/notifier · updated 1s ago\n esc close/u,
      );
    });

    it('should keep what the tool said when access is refused', () => {
      const drawn = draw({ dialog: dialogAt(ACCESS_REFUSED_PHASE) });

      expect(drawn).toMatchSnapshot();
      expect(drawn).toContain('THE TOOL SAID');
      expect(drawn).toContain('enter check again');
    });
  });

  describe('when the window has room for one panel', () => {
    it('should show the chosen repository in place of the list', () => {
      const drawn = draw({ size: NARROW, focused: 'details' });

      expect(drawn).toContain('COVERAGE');
      expect(drawn).not.toContain('example/gateway');
    });
  });

  describe('when colour is turned off', () => {
    it('should still show every state as a symbol', () => {
      const styled = styledAt(
        drawnWith({ colour: false }, view({})),
        USUAL_COLUMNS,
      );
      const text = plainText(styled);

      expect(styled).not.toMatch(COLOUR_CODE);
      for (const state of [
        '● example/payments',
        '⠋ example/gateway',
        '! example/billing-api',
        '○ example/notifier',
      ]) {
        expect(text).toContain(state);
      }
    });
  });

  it.each(SIZES)('should fit in $columns by $rows', (size) => {
    const drawn = draw({
      size,
      listing: { ...answered(), stale: true },
      problem: { kind: 'fault', fault: new Error('x'.repeat(300)) },
    });

    expect(widestLine(drawn)).toBeLessThanOrEqual(size.columns);
    expect(drawn.split('\n').length).toBeLessThanOrEqual(size.rows);
  });
});
