import { describe, expect, it } from 'vitest';

import {
  FIRST_JOURNEY,
  type Journey,
  keptOf,
  type Move,
  moved,
  type Place,
} from '#app/navigation';

const REPOSITORIES = { screen: 'repositories' } as const;
const IMPROVEMENTS = { screen: 'improvements' } as const;
const FILES = { screen: 'files', repositoryId: 'repository-1' } as const;
const OTHER_FILES = { screen: 'files', repositoryId: 'repository-2' } as const;
const IMPROVEMENT = {
  screen: 'improvement',
  improvementId: 'improvement-1',
} as const;
const NO_SUCH_SECTION = 7;

function after(...moves: readonly Move[]): Journey {
  return moves.reduce(moved, FIRST_JOURNEY);
}

function open(place: Place): Move {
  return { kind: 'open', place };
}

function section(index: number): Move {
  return { kind: 'section', index };
}

const BACK: Move = { kind: 'back' };

/** The screen that shows. */
function shownOf(journey: Journey): Place | undefined {
  return keptOf(journey).find(({ shown }) => shown)?.place;
}

describe('moved', () => {
  it('should open a screen at the end of the trail', () => {
    const journey = after(open(FILES));

    expect(journey.trail).toEqual([REPOSITORIES, FILES]);
    expect(shownOf(journey)).toEqual(FILES);
  });

  it('should go back one screen at a time', () => {
    const journey = after(open(FILES), open(IMPROVEMENT), BACK);

    expect(journey.trail).toEqual([REPOSITORIES, FILES]);
  });

  it('should stay in the section when there is nowhere to go back to', () => {
    expect(after(BACK)).toEqual(FIRST_JOURNEY);
  });

  it('should enter a section at its first screen', () => {
    const journey = after(open(FILES), section(1));

    expect(journey.section).toBe(1);
    expect(shownOf(journey)).toEqual(IMPROVEMENTS);
  });

  it('should show a section that was left where it was left', () => {
    const journey = after(
      open(FILES),
      section(1),
      open(IMPROVEMENT),
      section(0),
    );

    expect(shownOf(journey)).toEqual(FILES);
    expect(journey.left.get(1)).toEqual([IMPROVEMENTS, IMPROVEMENT]);
  });

  it('should go back to the first screen on the key of the section that shows', () => {
    const journey = after(open(FILES), section(0));

    expect(journey.trail).toEqual([REPOSITORIES]);
  });

  it('should stay where it is for a section that does not exist', () => {
    expect(moved(FIRST_JOURNEY, section(NO_SUCH_SECTION))).toBe(FIRST_JOURNEY);
  });
});

describe('keptOf', () => {
  it('should keep every screen of every trail, and show one', () => {
    const kept = keptOf(after(open(FILES), section(1), open(IMPROVEMENT)));

    expect(kept.map(({ place, shown }) => [place.screen, shown])).toEqual([
      ['repositories', false],
      ['files', false],
      ['improvements', false],
      ['improvement', true],
    ]);
  });

  it('should name a screen opened anew apart from the one that was left', () => {
    const first = keptOf(after(open(FILES)));
    const again = keptOf(after(open(FILES), BACK, open(OTHER_FILES)));

    expect(first[1]?.key).not.toBe(again[1]?.key);
    expect(first[0]?.key).toBe(again[0]?.key);
  });
});
