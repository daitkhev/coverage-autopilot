import { mkdir } from 'node:fs/promises';

import { Inject, Injectable } from '@nestjs/common';

import { CommitSha } from '#kernel/primitives/commit-sha';
import type {
  BranchHeadResult,
  BranchRequest,
  DefaultBranchResult,
  Git,
  GitVersionResult,
  RevisionRequest,
} from '#repositories/application/ports/git.port';
import { BranchName } from '#repositories/domain/value-objects/branch-name.vo';
import type { RepositoryUrl } from '#repositories/domain/value-objects/repository-url.vo';
import type { RevisionFacts } from '#repositories/domain/value-objects/revision-assessment.vo';
import { ToolFailedError } from '#repositories/infrastructure/errors/tool-failed.error';
import { ToolMissingError } from '#repositories/infrastructure/errors/tool-missing.error';
import { GitMirror } from '#repositories/infrastructure/git/git-mirror';
import {
  remoteRefSchema,
  symbolicHeadSchema,
} from '#repositories/infrastructure/git/git-output.schema';
import {
  REPOSITORIES_SETTINGS,
  type RepositoriesSettings,
  secretValuesOf,
} from '#repositories/infrastructure/repositories-settings';
import { parseToolOutput } from '#repositories/infrastructure/tools/tool-output';
import {
  type ToolCall,
  ToolRunner,
} from '#repositories/infrastructure/tools/tool-runner';

/** The exit code of `merge-base --is-ancestor` and `diff --quiet` for "no". */
const NO = 1;

const NO_DEFAULT_BRANCH =
  'The repository names no default branch. It may have no commit yet.';

/**
 * The `git` program, run with the settings of the module. A call that
 * does not belong to a folder of its own starts in the root of the
 * working copies, which belongs to the service alone.
 */
@Injectable()
export class GitCli implements Git {
  private readonly git: ToolRunner;
  private readonly mirror: GitMirror;
  private readonly root: string;

  public constructor(
    @Inject(REPOSITORIES_SETTINGS) settings: RepositoriesSettings,
  ) {
    this.git = new ToolRunner({
      name: 'git',
      settings: settings.git,
      secrets: secretValuesOf(settings),
    });
    this.root = settings.workingCopiesRoot;
    this.mirror = new GitMirror(this.git, this.root);
  }

  public async version(signal: AbortSignal): Promise<GitVersionResult> {
    try {
      const run = await this.git.runChecked(
        await this.atRoot(['--version']),
        signal,
      );
      return { outcome: 'found', version: run.stdout.trim() };
    } catch (error) {
      if (error instanceof ToolMissingError) {
        return { outcome: 'missing' };
      }
      throw error;
    }
  }

  public async readDefaultBranch(
    url: RepositoryUrl,
    signal: AbortSignal,
  ): Promise<DefaultBranchResult> {
    const run = await this.git.run(
      await this.atRoot(['ls-remote', '--symref', url.value, 'HEAD']),
      signal,
    );
    if (run.exitCode !== 0) {
      return { outcome: 'refused', output: run.output };
    }
    const branch = parseToolOutput(
      symbolicHeadSchema,
      run.stdout,
      'git ls-remote',
    );
    return branch === null
      ? { outcome: 'refused', output: NO_DEFAULT_BRANCH }
      : { outcome: 'read', branch: BranchName.create(branch) };
  }

  public async readBranchHead(
    request: BranchRequest,
    signal: AbortSignal,
  ): Promise<BranchHeadResult> {
    const ref = request.branch.ref;
    const run = await this.git.run(
      await this.atRoot(['ls-remote', request.url.value, ref]),
      signal,
    );
    if (run.exitCode !== 0) {
      return { outcome: 'refused', output: run.output };
    }
    const commit = parseToolOutput(
      remoteRefSchema(ref),
      run.stdout,
      'git ls-remote',
    );
    return commit === null
      ? { outcome: 'absent' }
      : { outcome: 'read', commit: CommitSha.create(commit) };
  }

  public async compareRevisions(
    request: RevisionRequest,
    signal: AbortSignal,
  ): Promise<RevisionFacts> {
    const headCommit = await this.mirror.fetchBranch(request, signal);
    const path = this.mirror.pathOf(request.repositoryId);
    const snapshot = request.snapshotCommit.value;
    const known = await this.mirror.hasCommit(
      path,
      request.snapshotCommit,
      signal,
    );
    const ancestry = [
      'merge-base',
      '--is-ancestor',
      snapshot,
      headCommit.value,
    ];
    if (!known || !(await this.answers(path, ancestry, signal))) {
      return { headCommit, snapshotIsAncestor: false };
    }
    const sameFile = await this.answers(
      path,
      [
        '--literal-pathspecs',
        'diff',
        '--quiet',
        '--no-ext-diff',
        snapshot,
        headCommit.value,
        '--',
        request.targetFile.value,
      ],
      signal,
    );
    return {
      headCommit,
      snapshotIsAncestor: true,
      targetFileChanged: !sameFile,
    };
  }

  /** A call whose exit code is its answer: 0 for yes, 1 for no. */
  private async answers(
    directory: string,
    args: readonly string[],
    signal: AbortSignal,
  ): Promise<boolean> {
    const call = { arguments: args, directory };
    const run = await this.git.run(call, signal);
    if (run.exitCode > NO) {
      throw new ToolFailedError(
        `git ${args.join(' ')} failed. It said: ${run.output}`,
      );
    }
    return run.exitCode === 0;
  }

  private async atRoot(args: readonly string[]): Promise<ToolCall> {
    await mkdir(this.root, { recursive: true });
    return { arguments: args, directory: this.root };
  }
}
