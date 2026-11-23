export function sign(value: number): string {
  return value > 0 ? 'plus' : value < 0 ? 'minus' : 'zero';
}
