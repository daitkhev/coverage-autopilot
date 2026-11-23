import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { CommitSha } from '#kernel/primitives/commit-sha';
import type { RepositoryId } from '#kernel/primitives/repository-id';
import type { BranchName } from '#repositories/domain/value-objects/branch-name.vo';
import type { RepositoryUrl } from '#repositories/domain/value-objects/repository-url.vo';
import { CommitNotFoundError } from '#repositories/infrastructure/errors/commit-not-found.error';
import { revisionSchema } from '#repositories/infrastructure/git/git-output.schema';
import type { MirrorTurns } from '#repositories/infrastructure/git/mirror-turns';
import { parseToolOutput } from '#repositories/infrastructure/tools/tool-output';
import type {
  ToolCall,
  ToolRunner,
} from '#repositories/infrastructure/tools/tool-runner';

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
 * and no link back, so nothing done in a copy reaches the mirror. No tree
 * is ever checked out of it, and every call names it, so git never looks
 * for a repository in a folder and never takes another for it. Every
 * change of a mirror waits for its turn, so two requests, or a request
 * and a job, never fetch into one mirror at once.
 */
export class GitMirror {
  private readonly git: ToolRunner;
  private readonly folder: string;
  private readonly turns: MirrorTurns;

  public constructor(git: ToolRunner, root: string, turns: MirrorTurns) {
    this.git = git;
    this.folder = join(root, MIRRORS);
    this.turns = turns;
  }

  public pathOf(repositoryId: RepositoryId): string {
    return join(this.folder, `${repositoryId.value}.git`);
  }

  /** A call in the mirror at the path, which it names. */
  public callIn(path: string, args: readonly string[]): ToolCall {
    return { arguments: [`--git-dir=${path}`, ...args], directory: path };
  }

  /** Brings the branch from the host and gives the commit it is at. */
  public async fetchBranch(
    request: MirrorRequest,
    signal: AbortSignal,
  ): Promise<CommitSha> {
    const path = this.pathOf(request.repositoryId);
    return this.turns.take(path, async () => {
      await this.prepare(path, signal);
      return this.fetchedBranch(path, request, signal);
    });
  }

  /**
   * Makes sure the mirror has the commit: from the branch, and when the
   * branch has moved past it on another line, by its hash.
   */
  public async ensureCommit(
    request: MirrorRequest & { readonly commit: CommitSha },
    signal: AbortSignal,
  ): Promise<void> {
    const path = this.pathOf(request.repositoryId);
    await this.turns.take(path, async () => {
      await this.prepare(path, signal);
      if (await this.hasCommit(path, request.commit, signal)) {
        return;
      }
      await this.fetchedBranch(path, request, signal);
      if (await this.hasCommit(path, request.commit, signal)) {
        return;
      }
      await this.fetchCommit(path, request, signal);
    });
  }

  public async hasCommit(
    path: string,
    commit: CommitSha,
    signal: AbortSignal,
  ): Promise<boolean> {
    const run = await this.git.run(
      this.callIn(path, ['cat-file', '-e', `${commit.value}^{commit}`]),
      signal,
    );
    return run.exitCode === 0;
  }

  /** The fetch of the branch, in the turn of the mirror. */
  private async fetchedBranch(
    path: string,
    request: MirrorRequest,
    signal: AbortSignal,
  ): Promise<CommitSha> {
    const ref = request.branch.ref;
    await this.git.runChecked(
      this.callIn(path, [
        'fetch',
        '--quiet',
        '--no-tags',
        request.url.value,
        `+${ref}:${ref}`,
      ]),
      signal,
    );
    const run = await this.git.runChecked(
      this.callIn(path, ['rev-parse', '--verify', `${ref}^{commit}`]),
      signal,
    );
    return CommitSha.create(
      parseToolOutput(revisionSchema, run.stdout, 'git rev-parse'),
    );
  }

  /** The fetch of a commit by its hash, in the turn of the mirror. */
  private async fetchCommit(
    path: string,
    request: MirrorRequest & { readonly commit: CommitSha },
    signal: AbortSignal,
  ): Promise<void> {
    const run = await this.git.run(
      this.callIn(path, [
        'fetch',
        '--quiet',
        '--no-tags',
        request.url.value,
        request.commit.value,
      ]),
      signal,
    );
    if (run.exitCode !== 0) {
      throw new CommitNotFoundError(
        `${request.url.fullName} does not give the commit ${request.commit.value}. git said: ${run.output}`,
      );
    }
  }

  /**
   * The mirror at the path, made the first time it is needed, with no
   * template, so no hook comes with it. It runs in the turn of the
   * mirror, so two first calls do not make it at once.
   */
  private async prepare(path: string, signal: AbortSignal): Promise<void> {
    if (existsSync(join(path, 'HEAD'))) {
      return;
    }
    await mkdir(this.folder, { recursive: true });
    await this.git.runChecked(
      {
        arguments: ['init', '--quiet', '--bare', '--template=', path],
        directory: this.folder,
      },
      signal,
    );
  }
}
