/** A screen, and what it is about. */
export type Place =
  | { readonly screen: 'repositories' | 'improvements' | 'service' }
  | { readonly screen: 'files'; readonly repositoryId: string }
  | {
      readonly screen: 'improvement' | 'patch';
      readonly improvementId: string;
    };

/** The way from a section to the screen that shows. The section is first. */
export type Trail = readonly [Place, ...Place[]];

/** What takes the user from one screen to another. */
export type Move =
  | { readonly kind: 'section'; readonly index: number }
  | { readonly kind: 'open'; readonly place: Place }
  | { readonly kind: 'back' };

interface Section {
  readonly name: string;
  readonly place: Place;
}

/** The three sections of the header, in the order of their keys. */
export const SECTIONS: readonly Section[] = [
  { name: 'Repositories', place: { screen: 'repositories' } },
  { name: 'Improvements', place: { screen: 'improvements' } },
  { name: 'Service', place: { screen: 'service' } },
];

/** Where the client opens. */
export const FIRST_TRAIL: Trail = [{ screen: 'repositories' }];

/**
 * The trail after a move. A section starts its trail over, and the way
 * back ends at the section, which has nowhere to go back to.
 */
export function moved(trail: Trail, move: Move): Trail {
  const [section, ...opened] = trail;
  switch (move.kind) {
    case 'section': {
      const chosen = SECTIONS[move.index];
      return chosen === undefined ? trail : [chosen.place];
    }
    case 'open':
      return [...trail, move.place];
    case 'back':
      return [section, ...opened.slice(0, -1)];
  }
}

/** The screen that shows: the end of the trail. */
export function shownOf(trail: Trail): Place {
  const [section, ...opened] = trail;
  return opened.at(-1) ?? section;
}

/** The section the trail started in, as its place in the header. */
export function sectionOf(trail: Trail): number {
  return SECTIONS.findIndex(({ place }) => place.screen === trail[0].screen);
}
