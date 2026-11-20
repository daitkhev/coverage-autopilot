export function label(name: string | undefined): string {
  if (name !== undefined) {
    return name;
  }
  return 'none';
}
