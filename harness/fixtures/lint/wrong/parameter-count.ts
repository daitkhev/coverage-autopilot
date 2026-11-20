export function area(
  left: number,
  top: number,
  right: number,
  bottom: number,
): number {
  return (right - left) * (bottom - top);
}
