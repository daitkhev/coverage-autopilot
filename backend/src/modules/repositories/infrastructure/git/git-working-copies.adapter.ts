import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';

import { Inject, Injectable } from '@nestjs/common';

import { faultFieldsOf } from '#infrastructure/logging/fault-fields';
import { ToolLog } from '#infrastructure/logging/tool-log';
import { FilePath } from '#kernel/primitives/file-path';
import { CLOCK, type Clock } from '#kernel/time/clock';
import { LOGGER, type Logger } from '#ports/logger.port';
import type {
  CopyApplyResult,
  CopyPatchResult,
  CreateCopyRequest,
  PushRequest,
  PushResult,
  WorkingCopies,
} from '#repositories/application/ports/working-copies.port';
import type { WorkingCopyId } from '#repositories/domain/value-objects/working-copy-id.vo';
import { WorkingCopyTamperedError } from '#repositories/infrastructure/errors/working-copy-tampered.error';
import { gitEntriesIn } from '#repositories/infrastructure/git/git-entries';
import { GitMirror } from '#repositories/infrastructure/git/git-mirror';
import {
  numstatSchema,
  pathListSchema,
} from '#repositories/infrastructure/git/git-output.schema';
import {
  hostGit,
  isolatedGit,
} from '#repositories/infrastructure/git/git-tool-settings';
import {
  type CopyFolders,
  WorkingCopyFolders,
} from '#repositories/infrastructure/git/working-copy-folders';
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

/** Local work on a copy is short, and the contract gives it no signal. */
const UNSTOPPABLE = new AbortController().signal;

/**
 * Options that keep the diff of a copy plain text that `git apply` takes
 * back: no colour, no program of a configuration or conversion, a new
 * file as a new file and not as a rename.
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

/** git on a copy, with both of its folders named, so git looks for neither. */
function inCopy(copy: CopyFolders, args: readonly string[]): ToolCall {
  return {
    arguments: [
      `--git-dir=${copy.gitDir}`,
      `--work-tree=${copy.tree}`,
      ...args,
    ],
    directory: copy.tree,
  };
}

/**
 * Working copies as clones of the mirror of their repository, each with a
 * tree and a git directory of its own, the git directory outside the tree.
 */
@Injectable()
export class GitWorkingCopies implements WorkingCopies {
  /** For the work on a copy: no configuration but the copy's own. */
  private readonly local: ToolRunner;
  /** For the mirror and the push, which need the operator's configuration. */
  private readonly host: ToolRunner;
  private readonly mirror: GitMirror;
  private readonly folders: WorkingCopyFolders;
  private readonly logger: Logger;

  public constructor(
    @Inject(REPOSITORIES_SETTINGS) settings: RepositoriesSettings,
    @Inject(LOGGER) logger: Logger,
    @Inject(CLOCK) clock: Clock,
  ) {
    const secrets = secretValuesOf(settings);
    const log = new ToolLog(logger, clock);
    this.local = new ToolRunner({
      name: 'git',
      settings: isolatedGit(settings.git),
      secrets,
      log,
    });
    this.host = new ToolRunner({
      name: 'git',
      settings: hostGit(settings.git),
      secrets,
      log,
    });
    this.mirror = new GitMirror(this.host, settings.workingCopiesRoot);
    this.folders = new WorkingCopyFolders(settings.workingCopiesRoot);
    this.logger = logger.child({ component: 'working-copies' });
  }

  public async create(
    request: CreateCopyRequest,
    signal: AbortSignal,
  ): Promise<string> {
    const copy = this.folders.of(request.id);
    await this.folders.remove(copy);
    await this.mirror.ensureCommit(request, signal);
    try {
      await this.clone(request, copy, signal);
    } catch (error) {
      await this.dispose(request.id);
      throw error;
    }
    return copy.tree;
  }

  /**
   * The work that used the copy is over, and its result counts for more
   * than the folders: a copy that stays is told in the log, and the next
   * start of the service, or the next copy of the id, removes it.
   */
  public async dispose(id: WorkingCopyId): Promise<void> {
    try {
      await this.folders.remove(this.folders.of(id));
    } catch (error) {
      this.logger.error(
        'A working copy could not be removed, so its folders stay on disk.',
        { workingCopyId: id.value, ...faultFieldsOf(error) },
      );
    }
  }

  public async extractPatch(id: WorkingCopyId): Promise<CopyPatchResult> {
    const copy = await this.untouched(id);
    await this.runInCopy(copy, ['add', '--all']);
    const text = (
      await this.runInCopy(copy, [...PLAIN_DIFF, '--binary', 'HEAD'])
    ).stdout;
    if (text === '') {
      return { outcome: 'empty' };
    }
    const names = await this.runInCopy(copy, [
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
    const copy = await this.untouched(id);
    if (MOVE_HEADER.test(patchText)) {
      return { outcome: 'refused', reason: MOVE_REFUSED };
    }
    const applied = await this.local.run(
      { ...inCopy(copy, ['apply', '--whitespace=nowarn']), input: patchText },
      UNSTOPPABLE,
    );
    if (applied.exitCode !== 0) {
      return { outcome: 'refused', reason: applied.output };
    }
    const stat = await this.local.runChecked(
      { ...inCopy(copy, ['apply', '--numstat', '-z']), input: patchText },
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
    const copy = await this.untouched(request.id);
    await this.runInCopy(copy, ['add', '--all']);
    await this.local.runChecked(
      {
        ...inCopy(copy, ['commit', '--quiet', '--no-verify', '--file=-']),
        input: request.commitMessage,
      },
      signal,
    );
    const pushed = await this.host.run(
      {
        arguments: [
          `--git-dir=${copy.gitDir}`,
          'push',
          '--quiet',
          request.url.value,
          `HEAD:${request.branch.ref}`,
        ],
        directory: copy.gitDir,
      },
      signal,
    );
    return pushed.exitCode === 0
      ? { outcome: 'pushed' }
      : { outcome: 'refused', reason: pushed.output };
  }

  /**
   * A bare clone with objects of its own and no template, so nothing done
   * in the copy reaches the mirror and no hook comes with it, then the
   * files of the commit in the tree.
   */
  private async clone(
    request: CreateCopyRequest,
    copy: CopyFolders,
    signal: AbortSignal,
  ): Promise<void> {
    await mkdir(this.folders.gitDirs, { recursive: true });
    await this.local.runChecked(
      {
        arguments: [
          'clone',
          '--quiet',
          '--bare',
          '--no-hardlinks',
          '--template=',
          this.mirror.pathOf(request.repositoryId),
          copy.gitDir,
        ],
        directory: this.folders.gitDirs,
      },
      signal,
    );
    await mkdir(copy.tree, { recursive: true });
    await this.local.runChecked(
      inCopy(copy, ['checkout', '--quiet', '--detach', request.commit.value]),
      signal,
    );
  }

  /**
   * The copy, once its tree is known to hold no `.git`. git never looks
   * for one, since every call names both folders, but a nested one would
   * still be a repository git enters on its own when it adds the tree.
   */
  private async untouched(id: WorkingCopyId): Promise<CopyFolders> {
    const copy = this.folders.existing(id);
    const entries = await gitEntriesIn(copy.tree);
    if (entries.length > 0) {
      throw new WorkingCopyTamperedError(
        `The tree of the working copy "${id.value}" holds ${String(entries.length)} .git of its own, such as ${JSON.stringify(entries[0])}. Something it was lent to wrote them, and git was not run in it.`,
      );
    }
    return copy;
  }

  private async runInCopy(
    copy: CopyFolders,
    args: readonly string[],
  ): Promise<{ readonly stdout: string }> {
    return this.local.runChecked(inCopy(copy, args), UNSTOPPABLE);
  }
}
