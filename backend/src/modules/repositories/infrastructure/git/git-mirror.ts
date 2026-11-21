import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { CommitSha } from '#kernel/primitives/commit-sha';
import type { RepositoryId } from '#kernel/primitives/repository-id';
import type { BranchName } from '#repositories/domain/value-objects/branch-name.vo';
import type { RepositoryUrl } from '#repositories/domain/value-objects/repository-url.vo';
import { CommitNotFoundError } from '#repositories/infrastructure/errors/commit-not-found.error';
import { revisionSchema } from '#repositories/infrastructure/git/git-output.schema';
import { parseToolOutput } from '#repositories/infrastructure/tools/tool-output';
import type { ToolRunner } from '#repositories/infrastructure/tools/tool-runner';

/** The folder of the mirrors under the root of the working copies. */
const MIRRORS = 'mirrors';

export interface MirrorRequest {
  readonly repositoryId: RepositoryId;
  readonly url: RepositoryUrl;
  readonly branch: BranchName;
}

/**
 * One bare clone per repository that the working copies are cloned from,
 * so the host is asked only for what is new. A copy gets its own objects
 * and no link back, so nothing done in a copy reaches the mirror.
 */
export class GitMirror {
  private readonly git: ToolRunner;
  private readonly folder: string;

  public constructor(git: ToolRunner, root: string) {
    this.git = git;
    this.folder = join(root, MIRRORS);
  }

  public pathOf(repositoryId: RepositoryId): string {
    return join(this.folder, `${repositoryId.value}.git`);
  }

  /** Brings the branch from the host and gives the commit it is at. */
  public async fetchBranch(
    request: MirrorRequest,
    signal: AbortSignal,
  ): Promise<CommitSha> {
    const path = await this.prepared(request.repositoryId, signal);
    const ref = request.branch.ref;
    await this.git.runChecked(
      {
        arguments: [
          'fetch',
          '--quiet',
          '--no-tags',
          request.url.value,
          `+${ref}:${ref}`,
        ],
        directory: path,
      },
      signal,
    );
    const run = await this.git.runChecked(
      {
        arguments: ['rev-parse', '--verify', `${ref}^{commit}`],
        directory: path,
      },
      signal,
    );
    return CommitSha.create(
      parseToolOutput(revisionSchema, run.stdout, 'git rev-parse'),
    );
  }

  /**
   * Makes sure the mirror has the commit: from the branch, and when the
   * branch has moved past it on another line, by its hash.
   */
  public async ensureCommit(
    request: MirrorRequest & { readonly commit: CommitSha },
    signal: AbortSignal,
  ): Promise<void> {
    const path = await this.prepared(request.repositoryId, signal);
    if (await this.hasCommit(path, request.commit, signal)) {
      return;
    }
    await this.fetchBranch(request, signal);
    if (await this.hasCommit(path, request.commit, signal)) {
      return;
    }
    const run = await this.git.run(
      {
        arguments: [
          'fetch',
          '--quiet',
          '--no-tags',
          request.url.value,
          request.commit.value,
        ],
        directory: path,
      },
      signal,
    );
    if (run.exitCode !== 0) {
      throw new CommitNotFoundError(
        `${request.url.fullName} does not give the commit ${request.commit.value}. git said: ${run.output}`,
      );
    }
  }

  public async hasCommit(
    path: string,
    commit: CommitSha,
    signal: AbortSignal,
  ): Promise<boolean> {
    const run = await this.git.run(
      {
        arguments: ['cat-file', '-e', `${commit.value}^{commit}`],
        directory: path,
      },
      signal,
    );
    return run.exitCode === 0;
  }

  /** The mirror of the repository, made the first time it is needed. */
  private async prepared(
    repositoryId: RepositoryId,
    signal: AbortSignal,
  ): Promise<string> {
    const path = this.pathOf(repositoryId);
    if (!existsSync(join(path, 'HEAD'))) {
      await mkdir(this.folder, { recursive: true });
      await this.git.runChecked(
        {
          arguments: ['init', '--quiet', '--bare', path],
          directory: this.folder,
        },
        signal,
      );
    }
    return path;
  }
}
