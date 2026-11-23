// The clock is passed in, so a test can fix the time.
export function stamp(now: Date): string {
  return now.toISOString();
}
