import type { StartImprovementRequest } from '@coverage-autopilot/api-contracts/improvements';
import type { InstallMode } from '@coverage-autopilot/api-contracts/repositories';
import type { SnapshotFilesQuery } from '@coverage-autopilot/api-contracts/snapshots';

/** A command that takes nothing after its name: its name is all of it. */
type NoArguments = object;

/** A repository as a person names it, `owner/name`. */
interface RepositoryArgument {
  readonly repository: string;
}

/** The id of an improvement or a scan, as the service gave it. */
interface IdArgument {
  readonly id: string;
}

/** `--wait`: block until the work is final. */
interface WaitFlag {
  readonly wait: boolean;
}

/** What `improve` asks for. The snapshot is found when it runs. */
type ImprovementRequest = Omit<StartImprovementRequest, 'snapshotId'>;

/** The arguments and the flags of each command, after its name. */
interface CommandArguments {
  readonly 'repo add': { readonly url: string };
  readonly 'repo list': NoArguments;
  readonly 'repo check': RepositoryArgument;
  /** `null` gives the repository the threshold of the service back. */
  readonly 'repo threshold': RepositoryArgument & {
    readonly percentage: number | null;
  };
  /** `null` gives the repository the mode of install of the service back. */
  readonly 'repo trust': RepositoryArgument & {
    readonly mode: InstallMode | null;
  };
  readonly scan: RepositoryArgument & WaitFlag;
  readonly files: RepositoryArgument & { readonly query: SnapshotFilesQuery };
  readonly improve: RepositoryArgument &
    WaitFlag & { readonly request: ImprovementRequest };
  readonly list: NoArguments;
  readonly status: IdArgument;
  readonly patch: IdArgument;
  readonly approve: IdArgument & { readonly hash: string };
  readonly cancel: IdArgument;
  readonly doctor: NoArguments;
}

/** The name of a command as a person types it, such as `repo add`. */
export type CommandName = keyof CommandArguments;

/**
 * One command with its arguments. A command of one name is its own type,
 * so the table that runs a command by its name stays typed.
 */
export type Command<Name extends CommandName = CommandName> = {
  readonly [Each in Name]: { readonly name: Each } & CommandArguments[Each];
}[Name];
