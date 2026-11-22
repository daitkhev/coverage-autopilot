import type { ReactNode } from 'react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { Improvement } from '@coverage-autopilot/api-contracts/improvements';

import type { DatedRequest } from '#hooks/use-dated-request';
import { visibleRowsOf } from '#screens/improvements/improvement-list';
import {
  type Listing,
  listingOf,
} from '#screens/improvements/improvement-listing';
import { ImprovementsView } from '#screens/improvements/improvements-view';
import {
  answered as serviceAnswered,
  fakeServiceApi,
  SAMPLE_NOW,
} from '#tests/support/fake-service-api';
import { IMPROVEMENT_LIST } from '#tests/support/sample-improvements';
import { sampleFrame, USUAL_SIZE } from '#tests/support/sample-lists-frame';
import { REPOSITORY_LIST } from '#tests/support/sample-repositories';
import {
  drawnAt,
  drawnWith,
  plainText,
  styledAt,
  USUAL_COLUMNS,
  widestLine,
  WIDTHS,
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
const IMPROVEMENTS = 1;

/** Every sample improvement in the order of its group, as the list asks. */
let grouped: readonly Improvement[] = [];
let names: ReadonlyMap<string, string> = new Map();

beforeAll(async () => {
  const listing = await listingOf(
    fakeServiceApi({
      listImprovements: () =>
        Promise.resolve(serviceAnswered(IMPROVEMENT_LIST)),
      listRepositories: () => Promise.resolve(serviceAnswered(REPOSITORY_LIST)),
    }),
  );
  if (listing.outcome === 'answered') {
    grouped = listing.improvements;
    names = listing.names;
  }
});

function answered(
  improvements: readonly Improvement[] = grouped,
): DatedRequest<Listing> {
  return {
    answer: { outcome: 'answered', improvements, names },
    answeredAt: SECOND_AGO,
    stale: false,
    failure: undefined,
  };
}

function view({
  listing = answered(),
  fault,
  index = 0,
  size = USUAL_SIZE,
  focused = 'list',
}: {
  readonly listing?: DatedRequest<Listing>;
  readonly fault?: unknown;
  readonly index?: number;
  readonly size?: TerminalSize;
  readonly focused?: 'list' | 'details';
}): ReactNode {
  return (
    <ImprovementsView
      frame={sampleFrame(size, IMPROVEMENTS)}
      listing={listing}
      fault={fault}
      moment={{ now: SAMPLE_NOW, timeZone: 'UTC' }}
      position={{ index, offset: 0 }}
      visible={visibleRowsOf(size)}
      focused={focused}
    />
  );
}

function draw(parts: Parameters<typeof view>[0] = {}): string {
  return drawnAt(view(parts), parts.size?.columns ?? USUAL_COLUMNS);
}

describe('ImprovementsView', () => {
  it('should group the improvements by what they need, with the first chosen', () => {
    expect(draw()).toMatchSnapshot();
  });

  it('should put what needs the user first', () => {
    const headings = draw()
      .split('\n')
      .flatMap((line) => /^ │ ([A-Z ]+) \d+ ─/u.exec(line)?.[1] ?? []);

    expect(headings).toEqual(['NEEDS YOU', 'RUNNING', 'WAITING', 'FINISHED']);
  });

  it('should say a cancelled and a skipped improvement apart', () => {
    const drawn = draw();

    expect(drawn).toMatch(/■ CANCEL +src\/core\/retry\.ts/u);
    expect(drawn).toContain('cancelled at 14:01');
    expect(drawn).toMatch(/– SKIP +src\/ids\.ts/u);
    expect(drawn).toContain('The fresh measurement is');
  });

  it('should say what a waiting improvement waits for', () => {
    const drawn = draw();

    expect(drawn).toContain('example/payments · waits for its repository');
    expect(drawn).toContain('example/payments · limit spent, resumes at 16:00');
  });

  describe('when another improvement is chosen', () => {
    it.each([
      { index: 1, heading: 'RUNNING', words: 'analyzing' },
      { index: 2, heading: 'RUNNING', words: 'attempt 2 of 3, writing a test' },
      { index: 3, heading: 'RUNNING', words: 'attempt 2 of 3, check 5 of 7' },
      { index: 4, heading: 'RUNNING', words: 'publishing' },
      { index: 5, heading: 'WAITING', words: 'waits for its repository' },
      { index: 7, heading: 'HOW IT ENDED', words: 'pull request #131' },
      { index: 8, heading: 'HOW IT ENDED', words: '3 attempts were rejected.' },
    ])(
      'should show row $index in short, with its next step',
      ({ index, heading, words }) => {
        const drawn = draw({ index, focused: 'details' });

        expect(drawn).toContain(heading);
        expect(drawn).toContain(words);
        expect(drawn).toMatch(/NEXT ─+ │\n │ .* enter (follow|see)/u);
      },
    );

    it('should show what the gate said of its last judged attempt', () => {
      const drawn = draw({ index: 0 });

      expect(drawn).toContain('ATTEMPT 1');
      expect(drawn).toContain('✓ accepted');
      expect(drawn).toMatch(/Lines +41\.2% → 88\.2%/u);
      expect(drawn).toMatch(/Mutants +11 of 14 detected/u);
      expect(drawn).toContain('attempt 1 · patch 9c1e7ab');
    });
  });

  describe('when the list is longer than the window', () => {
    it('should say how many improvements are below', () => {
      const size = { ...USUAL_SIZE, rows: 24 };
      const drawn = draw({ size });

      expect(drawn).toContain('5 more below');
      expect(drawn.split('\n').length).toBeLessThanOrEqual(size.rows);
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

  describe('when there is no improvement', () => {
    it('should say so in one sentence with the key that changes it', () => {
      const drawn = draw({ listing: answered([]) });

      expect(drawn).toContain(
        'No improvements yet. Press 1 to choose a repository.',
      );
      expect(drawn).not.toContain('row 1 of');
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
        fault: new TypeError('The answer does not match its schema.'),
      });

      expect(drawn).toContain('THE CLIENT SAID');
    });

    it('should show what the service refused the list with', () => {
      const drawn = draw({
        listing: {
          ...answered(),
          answer: {
            outcome: 'refused',
            error: {
              error: 'internal_error',
              message: 'The list could not be read from the database.',
            },
          },
        },
      });

      expect(drawn).toContain('THE SERVICE ANSWERED');
      expect(drawn).toContain('internal_error');
    });
  });

  describe('when the window has room for one panel', () => {
    it('should show the chosen improvement in place of the list', () => {
      const drawn = draw({
        size: { ...USUAL_SIZE, columns: 80 },
        focused: 'details',
      });

      expect(drawn).toContain('WAITING FOR YOU');
      expect(drawn).not.toContain('NEEDS YOU');
    });
  });

  describe('when colour is turned off', () => {
    it('should still show every status as a symbol and a word', () => {
      const styled = styledAt(
        drawnWith({ colour: false }, view({})),
        USUAL_COLUMNS,
      );
      const text = plainText(styled);

      expect(styled).not.toMatch(COLOUR_CODE);
      for (const status of [
        '? REVIEW',
        '⠋ RUN',
        '○ WAIT',
        '✓ DONE',
        '✕ FAIL',
        '■ CANCEL',
        '– SKIP',
      ]) {
        expect(text).toContain(status);
      }
    });
  });

  it.each(WIDTHS)('should fit in %i columns', (columns) => {
    const drawn = draw({
      size: { ...USUAL_SIZE, columns },
      listing: { ...answered(), stale: true },
      fault: new Error('x'.repeat(300)),
    });

    expect(widestLine(drawn)).toBeLessThanOrEqual(columns);
    expect(drawn.split('\n').length).toBeLessThanOrEqual(USUAL_SIZE.rows);
  });
});
