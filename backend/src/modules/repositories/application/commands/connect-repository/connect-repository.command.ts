import type { RepositoryDto } from '#repositories/contracts/repositories-public-api';

export interface ConnectRepositoryCommand {
  /** The address as the user typed it. */
  readonly url: string;
}

/**
 * `already_connected`: the same owner and name were connected before, and
 * that repository is the answer. `unreachable`: git could not read the
 * repository, and said why.
 */
export type ConnectRepositoryResult =
  | {
      readonly outcome: 'connected' | 'already_connected';
      readonly repository: RepositoryDto;
    }
  | { readonly outcome: 'unreachable'; readonly reason: string };
