export function sign(value: number): string {
  if (value > 0) {
    return 'plus';
  }
  return value < 0 ? 'minus' : 'zero';
}
