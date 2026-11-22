import type { FilePath } from '#kernel/primitives/file-path';
import type { RepositoryId } from '#kernel/primitives/repository-id';

/** How far an improvement has come, as the module of improvements says. */
type ImprovementStatusName =
  | 'created'
  | 'analyzing'
  | 'generating'
  | 'waiting_for_limit'
  | 'verifying'
  | 'awaiting_approval'
  | 'publishing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'skipped';

/** The newest improvement of a file: which one, and how far it came. */
export interface ImprovementRefDto {
  readonly id: string;
  readonly status: ImprovementStatusName;
}

/** A file of a repository and the newest improvement of its path. */
export interface FileImprovementDto {
  readonly path: FilePath;
  readonly latest: ImprovementRefDto;
}

/**
 * The improvements of the files of a repository, which a person sees with
 * the files of a snapshot. This module declares the port and the module
 * of improvements, which is above it, answers it, so the route of the
 * files of a snapshot stays in this module.
 */
export interface FileImprovements {
  /** The newest improvement of each file of the repository that has one. */
  latestOf(repositoryId: RepositoryId): Promise<FileImprovementDto[]>;
}

/** The injection token of the improvements of the files of a repository. */
export const FILE_IMPROVEMENTS = Symbol('FileImprovements');
