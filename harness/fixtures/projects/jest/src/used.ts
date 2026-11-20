export function double(value: number): number {
  return value * 2;
}

export function halve(value: number): number {
  if (value === 0) {
    return 0;
  }
  return value / 2;
}
