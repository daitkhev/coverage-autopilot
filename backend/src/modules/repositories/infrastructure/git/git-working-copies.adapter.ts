import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { Inject, Injectable } from '@nestjs/common';

import { FilePath } from '#kernel/primitives/file-path';
import type {
  CopyApplyResult,
  CopyPatchResult,
  CreateCopyRequest,
  PushRequest,
  PushResult,
  WorkingCopies,
} from '#repositories/application/ports/working-copies.port';
import type { WorkingCopyId } from '#repositories/domain/value-objects/working-copy-id.vo';
import { WorkingCopyMissingError } from '#repositories/infrastructure/errors/working-copy-missing.error';
import { GitMirror } from '#repositories/infrastructure/git/git-mirror';
import {
  numstatSchema,
  pathListSchema,
} from '#repositories/infrastructure/git/git-output.schema';
import {
  REPOSITORIES_SETTINGS,
  type RepositoriesSettings,
  secretValuesOf,
} from '#repositories/infrastructure/repositories-settings';
import { parseToolOutput } from '#repositories/infrastructure/tools/tool-output';
import { ToolRunner } from '#repositories/infrastructure/tools/tool-runner';

/** The folder of the copies under the root of the working copies. */
const COPIES = 'copies';

/** Local work on a copy is short, and the contract gives it no signal. */
const UNSTOPPABLE = new AbortController().signal;

/**
 * Options that keep the diff of a copy plain text that `git apply` takes
 * back: no colour, no program or conversion of the user's configuration,
 * a new file as a new file and not as a rename.
 */
const PLAIN_DIFF = [
  'diff',
  '--cached',
  '--no-color',
  '--no-ext-diff',
  '--no-textconv',
  '--no-renames',
];

/**
 * The header of a file a patch renames or copies. `git apply` would name
 * only where such a file goes, so the file it leaves would be missing
 * from the files of the patch. A patch made here has no such header.
 */
const MOVE_HEADER = /^(?:rename|copy) from /mu;

const MOVE_REFUSED =
  'The patch renames or copies a file. Only a patch that names every ' +
  'file it changes, as one without renames does, is applied.';

/**
 * Working copies as clones of the mirror of their repository, each in the
 * folder its id names under one root.
 */
@Injectable()
export class GitWorkingCopies implements WorkingCopies {
  private readonly git: ToolRunner;
  private readonly mirror: GitMirror;
  private readonly folder: string;

  public constructor(
    @Inject(REPOSITORIES_SETTINGS) settings: RepositoriesSettings,
  ) {
    this.git = new ToolRunner({
      name: 'git',
      settings: settings.git,
      secrets: secretValuesOf(settings),
    });
    this.mirror = new GitMirror(this.git, settings.workingCopiesRoot);
    this.folder = join(settings.workingCopiesRoot, COPIES);
  }

  public async create(
    request: CreateCopyRequest,
    signal: AbortSignal,
  ): Promise<string> {
    const path = this.pathOf(request.id);
    await rm(path, { recursive: true, force: true });
    await mkdir(this.folder, { recursive: true });
    await this.mirror.ensureCommit(request, signal);
    try {
      await this.clone(request, path, signal);
    } catch (error) {
      await rm(path, { recursive: true, force: true });
      throw error;
    }
    return path;
  }

  public async dispose(id: WorkingCopyId): Promise<void> {
    await rm(this.pathOf(id), { recursive: true, force: true });
  }

  public async extractPatch(id: WorkingCopyId): Promise<CopyPatchResult> {
    const path = this.existing(id);
    await this.inCopy(path, ['add', '--all']);
    const text = (await this.inCopy(path, [...PLAIN_DIFF, '--binary', 'HEAD']))
      .stdout;
    if (text === '') {
      return { outcome: 'empty' };
    }
    const names = await this.inCopy(path, [
      ...PLAIN_DIFF,
      '--name-only',
      '-z',
      'HEAD',
    ]);
    const files = parseToolOutput(pathListSchema, names.stdout, 'git diff');
    const hash = createHash('sha256').update(text).digest('hex');
    return {
      outcome: 'extracted',
      patch: { text, hash, files: files.map((file) => FilePath.create(file)) },
    };
  }

  public async applyPatch(
    id: WorkingCopyId,
    patchText: string,
  ): Promise<CopyApplyResult> {
    const directory = this.existing(id);
    if (MOVE_HEADER.test(patchText)) {
      return { outcome: 'refused', reason: MOVE_REFUSED };
    }
    const applied = await this.git.run(
      {
        arguments: ['apply', '--whitespace=nowarn'],
        directory,
        input: patchText,
      },
      UNSTOPPABLE,
    );
    if (applied.exitCode !== 0) {
      return { outcome: 'refused', reason: applied.output };
    }
    const stat = await this.git.runChecked(
      { arguments: ['apply', '--numstat', '-z'], directory, input: patchText },
      UNSTOPPABLE,
    );
    const files = parseToolOutput(numstatSchema, stat.stdout, 'git apply');
    return {
      outcome: 'applied',
      files: files.map((file) => FilePath.create(file)),
    };
  }

  public async commitAndPush(
    request: PushRequest,
    signal: AbortSignal,
  ): Promise<PushResult> {
    const directory = this.existing(request.id);
    await this.inCopy(directory, ['add', '--all']);
    await this.git.runChecked(
      {
        arguments: ['commit', '--quiet', '--file=-'],
        directory,
        input: request.commitMessage,
      },
      signal,
    );
    const pushed = await this.git.run(
      {
        arguments: [
          'push',
          '--quiet',
          request.url.value,
          `HEAD:${request.branch.ref}`,
        ],
        directory,
      },
      signal,
    );
    return pushed.exitCode === 0
      ? { outcome: 'pushed' }
      : { outcome: 'refused', reason: pushed.output };
  }

  /** Its own objects, so nothing done in the copy reaches the mirror. */
  private async clone(
    request: CreateCopyRequest,
    path: string,
    signal: AbortSignal,
  ): Promise<void> {
    const mirror = this.mirror.pathOf(request.repositoryId);
    await this.git.runChecked(
      {
        arguments: [
          'clone',
          '--quiet',
          '--no-hardlinks',
          '--no-checkout',
          mirror,
          path,
        ],
        directory: this.folder,
      },
      signal,
    );
    await this.git.runChecked(
      {
        arguments: ['checkout', '--quiet', '--detach', request.commit.value],
        directory: path,
      },
      signal,
    );
  }

  private async inCopy(
    directory: string,
    args: readonly string[],
  ): Promise<{ readonly stdout: string }> {
    return this.git.runChecked({ arguments: args, directory }, UNSTOPPABLE);
  }

  private existing(id: WorkingCopyId): string {
    const path = this.pathOf(id);
    if (!existsSync(path)) {
      throw new WorkingCopyMissingError(
        `No working copy has the id "${id.value}".`,
      );
    }
    return path;
  }

  private pathOf(id: WorkingCopyId): string {
    return join(this.folder, id.value);
  }
}
