import { randomInt } from 'node:crypto';

/**
 * The choices of a stress test: the same seed gives the same choices, so
 * the seed that a failure names plays the run with them again. The order
 * the system then runs its processes in is its own.
 */
export interface SeededRandom {
  readonly seed: number;
  /** A whole number from 0 up to `bound`, without `bound`. */
  below(bound: number): number;
  /** Whether a thing of this probability, from 0 to 1, happens. */
  chance(probability: number): boolean;
  /** One of the items, which may not be none. */
  pick<Item>(items: readonly Item[]): Item;
  /** The items in an order of its choice. */
  shuffled<Item>(items: readonly Item[]): Item[];
}

/** The seeds a run draws from, `2 ** 31`: numbers a person can type again. */
const SEEDS = 2_147_483_648;

/*
 * The constants of mulberry32, a small generator with 32 bits of state:
 * enough to pick an order or a moment, and nothing that needs secrecy.
 */
const STEP = 0x6d2b79f5;
const FIRST_SHIFT = 15;
const SECOND_SHIFT = 7;
const THIRD_SHIFT = 14;
const ODD_MIX = 61;

/** `2 ** 32`, which a state of 32 bits is divided by to fall below 1. */
const WORD = 4_294_967_296;

/** A seed of its own for each run, which the run then names. */
export function drawnSeed(): number {
  return randomInt(SEEDS);
}

/** A number in `[0, 1)` from each call, in the order the seed gives. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + STEP) >>> 0;
    let mixed = Math.imul(state ^ (state >>> FIRST_SHIFT), state | 1);
    mixed ^=
      mixed + Math.imul(mixed ^ (mixed >>> SECOND_SHIFT), mixed | ODD_MIX);
    return ((mixed ^ (mixed >>> THIRD_SHIFT)) >>> 0) / WORD;
  };
}

/** Takes the items out one at a time, each at a place `below` picks. */
function shuffledWith<Item>(
  below: (bound: number) => number,
  items: readonly Item[],
): Item[] {
  const left = [...items];
  const order: Item[] = [];
  while (left.length > 0) {
    order.push(...left.splice(below(left.length), 1));
  }
  return order;
}

function pickedWith<Item>(
  below: (bound: number) => number,
  items: readonly Item[],
): Item {
  const item = items[below(items.length)];
  if (item === undefined) {
    throw new RangeError('There is nothing to pick from.');
  }
  return item;
}

/** The choices that `seed` gives. */
export function seededRandom(seed: number): SeededRandom {
  const next = mulberry32(seed);
  const below = (bound: number): number => Math.floor(next() * bound);
  return {
    seed,
    below,
    chance: (probability) => next() < probability,
    pick: (items) => pickedWith(below, items),
    shuffled: (items) => shuffledWith(below, items),
  };
}
