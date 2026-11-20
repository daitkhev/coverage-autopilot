export function stamp(): string {
  return new Date().toISOString();
}

export function elapsed(since: number): number {
  return Date.now() - since;
}
