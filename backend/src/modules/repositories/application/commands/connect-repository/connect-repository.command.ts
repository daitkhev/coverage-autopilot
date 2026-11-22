import type { RepositoryViewDto } from '#repositories/application/dto/repository-view.dto';

/** Connect a repository by the address a person typed. */
export interface ConnectRepositoryCommand {
  readonly url: string;
}

/**
 * `already_connected`: the same owner and name were connected before, and
 * that repository is the answer as it stands, with its snapshots and its
 * scan. `invalid_url`: the text is not the address of a repository on the
 * host of the code. `unreachable`: git could not read the repository. A
 * refusal says why, in words for people.
 */
export type ConnectRepositoryResult =
  | {
      readonly outcome: 'connected' | 'already_connected';
      readonly repository: RepositoryViewDto;
    }
  | {
      readonly outcome: 'invalid_url' | 'unreachable';
      readonly reason: string;
    };
