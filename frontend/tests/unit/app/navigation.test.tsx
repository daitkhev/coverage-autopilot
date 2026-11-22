import { describe, expect, it } from 'vitest';

import {
  FIRST_TRAIL,
  moved,
  sectionOf,
  SECTIONS,
  shownOf,
  type Trail,
} from '#app/navigation';

const FILES = { screen: 'files', repositoryId: 'repository-1' } as const;
const IMPROVEMENT = {
  screen: 'improvement',
  improvementId: 'improvement-1',
} as const;
const IMPROVEMENTS = 1;
const NO_SUCH_SECTION = 7;

describe('moved', () => {
  it('should open a screen at the end of the trail', () => {
    const trail = moved(FIRST_TRAIL, { kind: 'open', place: FILES });

    expect(trail).toEqual([{ screen: 'repositories' }, FILES]);
    expect(shownOf(trail)).toEqual(FILES);
  });

  it('should go back one screen at a time', () => {
    const deep: Trail = [{ screen: 'repositories' }, FILES, IMPROVEMENT];

    expect(moved(deep, { kind: 'back' })).toEqual([
      { screen: 'repositories' },
      FILES,
    ]);
  });

  it('should stay in the section when there is nowhere to go back to', () => {
    expect(moved(FIRST_TRAIL, { kind: 'back' })).toEqual(FIRST_TRAIL);
  });

  it('should start the trail of a section over', () => {
    const deep: Trail = [{ screen: 'repositories' }, FILES];

    const trail = moved(deep, { kind: 'section', index: IMPROVEMENTS });

    expect(trail).toEqual([{ screen: 'improvements' }]);
    expect(shownOf(trail)).toEqual({ screen: 'improvements' });
  });

  it('should stay where it is for a section that does not exist', () => {
    const move = { kind: 'section', index: NO_SUCH_SECTION } as const;

    expect(moved(FIRST_TRAIL, move)).toBe(FIRST_TRAIL);
  });
});

describe('sectionOf', () => {
  it('should name the section a trail started in, however deep it is', () => {
    const deep: Trail = [{ screen: 'improvements' }, IMPROVEMENT];

    expect(sectionOf(deep)).toBe(IMPROVEMENTS);
    expect(SECTIONS[sectionOf(deep)]?.name).toBe('Improvements');
  });
});
