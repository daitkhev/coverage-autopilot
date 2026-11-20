export function label(name: string | undefined): string {
  if (name) {
    return name;
  }
  return 'none';
}
