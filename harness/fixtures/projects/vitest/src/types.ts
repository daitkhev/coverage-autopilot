export interface Pair {
  readonly left: number;
  readonly right: number;
}

export type Side = keyof Pair;
