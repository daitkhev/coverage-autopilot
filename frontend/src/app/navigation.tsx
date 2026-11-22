/** A screen, and what it is about. */
export type Place =
  | { readonly screen: 'repositories' | 'improvements' | 'service' }
  | { readonly screen: 'files'; readonly repositoryId: string }
  | {
      readonly screen: 'improvement' | 'patch';
      readonly improvementId: string;
    };

/** The way from a section to the screen that shows. The section is first. */
type Trail = readonly [Place, ...Place[]];

/**
 * Where the person is: the section that shows and its trail, and the
 * trail of every section left, which shows again where it was left.
 */
export interface Journey {
  /** The section that shows, by its place in the header. */
  readonly section: number;
  readonly trail: Trail;
  /** The trails of the sections left, by the place of each section. */
  readonly left: ReadonlyMap<number, Trail>;
}

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
export const FIRST_JOURNEY: Journey = {
  section: 0,
  trail: [{ screen: 'repositories' }],
  left: new Map(),
};

/** A screen that is kept: the one that shows, or one hidden as it was left. */
export interface KeptPlace {
  /** Names the screen while it is kept, and another screen never. */
  readonly key: string;
  readonly place: Place;
  readonly shown: boolean;
}

/**
 * The key of a section shows the section where it was left, or at its
 * first screen. The key of the section that shows goes back to its first
 * screen.
 */
function entered(journey: Journey, index: number): Journey {
  const chosen = SECTIONS[index];
  if (chosen === undefined) {
    return journey;
  }
  const start: Trail = [chosen.place];
  if (index === journey.section) {
    return { ...journey, trail: start };
  }
  const left = new Map(journey.left).set(journey.section, journey.trail);
  const trail = left.get(index) ?? start;
  left.delete(index);
  return { section: index, trail, left };
}

/**
 * The journey after a move. Opening and going back change the trail of
 * the section that shows, and the way back ends at the section, which has
 * nowhere to go back to.
 */
export function moved(journey: Journey, move: Move): Journey {
  if (move.kind === 'section') {
    return entered(journey, move.index);
  }
  const { trail } = journey;
  const [section, ...opened] = trail;
  return {
    ...journey,
    trail:
      move.kind === 'open'
        ? [...trail, move.place]
        : [section, ...opened.slice(0, -1)],
  };
}

/**
 * Every screen of every trail, so a screen a person comes back to is the
 * one they left. The end of the trail of the section that shows is the
 * screen that shows. A key names the section, the depth and the place, so
 * a screen opened anew in the place of one that was left starts anew.
 */
export function keptOf(journey: Journey): KeptPlace[] {
  const trails = new Map(journey.left).set(journey.section, journey.trail);
  return [...trails].flatMap(([section, trail]) =>
    trail.map((place, depth) => ({
      key: `${String(section)} ${String(depth)} ${JSON.stringify(place)}`,
      place,
      shown: section === journey.section && depth === trail.length - 1,
    })),
  );
}
