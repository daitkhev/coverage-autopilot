export function volume(width: number, height: number, depth: number): number {
  return width * height * depth;
}

export class Box {
  public readonly sides: readonly number[];

  public constructor(left: number, top: number, right: number, bottom: number) {
    this.sides = [left, top, right, bottom];
  }
}
