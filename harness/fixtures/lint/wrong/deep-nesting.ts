export interface Flags {
  readonly first: boolean;
  readonly second: boolean;
  readonly third: boolean;
  readonly fourth: boolean;
}

export function depth(flags: Flags): string {
  if (flags.first) {
    if (flags.second) {
      if (flags.third) {
        if (flags.fourth) {
          return 'four';
        }
      }
    }
  }
  return 'less';
}
