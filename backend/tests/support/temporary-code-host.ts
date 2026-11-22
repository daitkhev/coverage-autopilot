import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import type { RepositoriesSettings } from '#repositories/infrastructure/repositories-settings';
import { DEFAULT_TEST_THRESHOLD } from '#tests/support/coverage-snapshots';
import { GhStandIn } from '#tests/support/gh-stand-in';

/** Where git is found on a desk and in CI. Nothing else is on the path. */
const SEARCH_PATH = '/usr/bin:/bin';

/** Fixed, so a commit of a test has the same hash on every run. */
const MOMENT = '2026-01-02T03:04:05Z';
const AUTHOR = 'Test Author';
const EMAIL = 'author@example.com';
const LONG_ENOUGH_MS = 60_000;

/** A value in the environments of the tools that must never be shown. */
export const SECRET_TOKEN = 'not-a-real-token-0815';

/** The files of a commit: a text writes a file, `null` removes it. */
export type CommitFiles = Readonly<Record<string, string | null>>;

interface CommitOptions {
  /** The commit to start from. The branch is rewritten to the new line. */
  readonly parent?: string;
  readonly branch?: string;
}

/**
 * A host of the code in a temporary folder: bare repositories that git
 * reaches at `https://github.com/<owner>/<name>` through a rewrite of the
 * address in its environment, and the stand-in of `gh`. Nothing reaches
 * the network, and no configuration of the user or of this repository is
 * read, so no hook of theirs runs.
 */
export class TemporaryCodeHost {
  public readonly folder: string;
  public readonly gh: GhStandIn;
  public readonly settings: RepositoriesSettings;
  private readonly remotes: string;
  private readonly seeds: string;
  private commits = 0;

  public constructor() {
    this.folder = realpathSync(mkdtempSync(join(tmpdir(), 'code-host-')));
    this.remotes = join(this.folder, 'remotes');
    this.seeds = join(this.folder, 'seeds');
    const ghFolder = join(this.folder, 'gh');
    mkdirSync(ghFolder);
    writeFileSync(join(this.folder, 'gitconfig'), '');
    this.gh = new GhStandIn(ghFolder, this.remotes);
    this.settings = {
      threshold: DEFAULT_TEST_THRESHOLD,
      workingCopiesRoot: join(this.folder, 'service'),
      git: {
        command: ['git'],
        environment: this.gitEnvironment(),
        timeoutMs: LONG_ENOUGH_MS,
      },
      gh: {
        command: this.gh.command,
        environment: { GH_TOKEN: SECRET_TOKEN },
        timeoutMs: LONG_ENOUGH_MS,
      },
      secretVariables: ['GH_TOKEN'],
    };
  }

  /** The address of a repository on the host, as a user types it. */
  public static urlOf(fullName: string): string {
    return `https://github.com/${fullName}`;
  }

  /** A bare repository with a first commit on `main`, and that commit. */
  public createRepository(fullName: string, files: CommitFiles): string {
    mkdirSync(join(this.remotes, fullName), { recursive: true });
    this.git(join(this.remotes, fullName), 'init', '--quiet', '--bare');
    mkdirSync(join(this.seeds, fullName), { recursive: true });
    this.git(join(this.seeds, fullName), 'init', '--quiet');
    return this.commit(fullName, files);
  }

  /** Commits the files on a branch of the repository, `main` unless named. */
  public commit(
    fullName: string,
    files: CommitFiles,
    options: CommitOptions = {},
  ): string {
    const seed = join(this.seeds, fullName);
    if (options.parent !== undefined) {
      this.git(seed, 'checkout', '--quiet', '--detach', options.parent);
    }
    this.write(seed, files);
    this.commits += 1;
    this.git(seed, 'add', '--all');
    this.git(
      seed,
      'commit',
      '--quiet',
      '--allow-empty',
      '--message',
      `change ${String(this.commits)}`,
    );
    const branch = `HEAD:refs/heads/${options.branch ?? 'main'}`;
    this.git(
      seed,
      'push',
      '--quiet',
      '--force',
      join(this.remotes, fullName),
      branch,
    );
    return this.git(seed, 'rev-parse', 'HEAD');
  }

  /** The path of the bare repository behind an address. */
  public remoteOf(fullName: string): string {
    return join(this.remotes, fullName);
  }

  /** Runs git with the environment of the host and gives its output. */
  public git(directory: string, ...args: string[]): string {
    return execFileSync('git', args, {
      cwd: directory,
      env: this.settings.git.environment,
      encoding: 'utf8',
    }).trim();
  }

  public remove(): void {
    rmSync(this.folder, { recursive: true, force: true });
  }

  private write(folder: string, files: CommitFiles): void {
    for (const [path, content] of Object.entries(files)) {
      const target = join(folder, path);
      if (content === null) {
        rmSync(target);
      } else {
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, content);
      }
    }
  }

  private gitEnvironment(): Record<string, string> {
    return {
      PATH: SEARCH_PATH,
      HOME: this.folder,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: join(this.folder, 'gitconfig'),
      GIT_AUTHOR_NAME: AUTHOR,
      GIT_AUTHOR_EMAIL: EMAIL,
      GIT_AUTHOR_DATE: MOMENT,
      GIT_COMMITTER_NAME: AUTHOR,
      GIT_COMMITTER_EMAIL: EMAIL,
      GIT_COMMITTER_DATE: MOMENT,
      GIT_CONFIG_COUNT: '2',
      GIT_CONFIG_KEY_0: `url.${this.remotes}/.insteadOf`,
      GIT_CONFIG_VALUE_0: 'https://github.com/',
      GIT_CONFIG_KEY_1: 'init.defaultBranch',
      GIT_CONFIG_VALUE_1: 'main',
      GH_TOKEN: SECRET_TOKEN,
    };
  }
}
