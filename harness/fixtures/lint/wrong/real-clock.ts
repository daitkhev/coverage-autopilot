export function stamp(): string {
  return new Date().toISOString();
}

export function elapsed(since: number): number {
  return Date.now() - since;
}

export function moment(): string {
  return Temporal.Now.instant().toString();
}
