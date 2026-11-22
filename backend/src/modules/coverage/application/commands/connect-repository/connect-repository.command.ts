import type { RepositoryViewDto } from '#coverage/application/dto/repository-view.dto';

/** Connect a repository by the address a person typed. */
export interface ConnectRepositoryCommand {
  readonly url: string;
}

/**
 * `already_connected`: the same repository was connected before, and is
 * the answer as it stands. `invalid_url`: the text is not the address of
 * a repository. `unreachable`: git could not read it. A refusal says why,
 * in words for people.
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
