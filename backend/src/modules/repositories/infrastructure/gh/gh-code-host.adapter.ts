import { mkdir } from 'node:fs/promises';

import { Inject, Injectable } from '@nestjs/common';

import { ToolLog } from '#infrastructure/logging/tool-log';
import { CLOCK, type Clock } from '#kernel/time/clock';
import { LOGGER, type Logger } from '#ports/logger.port';
import type {
  CodeHost,
  LoginResult,
  OpenPullRequestRequest,
  OpenPullRequestResult,
  PullRequest,
  PullRequestRequest,
  PushPermissionResult,
} from '#repositories/application/ports/code-host.port';
import type { RepositoryUrl } from '#repositories/domain/value-objects/repository-url.vo';
import { GhNotAuthenticatedError } from '#repositories/infrastructure/errors/gh-not-authenticated.error';
import { ToolFailedError } from '#repositories/infrastructure/errors/tool-failed.error';
import { ToolMissingError } from '#repositories/infrastructure/errors/tool-missing.error';
import {
  createdPullRequestSchema,
  pullRequestListSchema,
  repositoryPermissionsSchema,
} from '#repositories/infrastructure/gh/gh-output.schema';
import {
  REPOSITORIES_SETTINGS,
  type RepositoriesSettings,
  secretValuesOf,
} from '#repositories/infrastructure/repositories-settings';
import { parseToolOutput } from '#repositories/infrastructure/tools/tool-output';
import {
  type ToolCall,
  type ToolRun,
  ToolRunner,
} from '#repositories/infrastructure/tools/tool-runner';

/** The exit code `gh` gives when it has no login for the host. */
const NOT_AUTHENTICATED = 4;

/**
 * The host of the code through the `gh` program and the login the user
 * already has. `gh` keeps the token: the module never sees it, and every
 * value its settings mark as secret is hidden in what it keeps.
 */
@Injectable()
export class GhCodeHost implements CodeHost {
  private readonly gh: ToolRunner;
  private readonly root: string;

  public constructor(
    @Inject(REPOSITORIES_SETTINGS) settings: RepositoriesSettings,
    @Inject(LOGGER) logger: Logger,
    @Inject(CLOCK) clock: Clock,
  ) {
    this.gh = new ToolRunner({
      name: 'gh',
      settings: settings.gh,
      secrets: secretValuesOf(settings),
      log: new ToolLog(logger, clock),
    });
    this.root = settings.workingCopiesRoot;
  }

  public async loginStatus(
    host: string,
    signal: AbortSignal,
  ): Promise<LoginResult> {
    try {
      const run = await this.gh.run(
        await this.call(['auth', 'status', `--hostname=${host}`]),
        signal,
      );
      return run.exitCode === 0
        ? { outcome: 'logged_in' }
        : { outcome: 'logged_out', output: run.output };
    } catch (error) {
      if (error instanceof ToolMissingError) {
        return { outcome: 'missing' };
      }
      throw error;
    }
  }

  public async pushPermission(
    url: RepositoryUrl,
    signal: AbortSignal,
  ): Promise<PushPermissionResult> {
    const run = await this.gh.run(
      await this.call(['api', `repos/${url.fullName}`]),
      signal,
    );
    if (run.exitCode !== 0) {
      return { outcome: 'refused', output: run.output };
    }
    const answer = parseToolOutput(
      repositoryPermissionsSchema,
      run.stdout,
      'gh api',
    );
    return answer.permissions.push
      ? { outcome: 'allowed' }
      : { outcome: 'denied' };
  }

  public async findPullRequest(
    request: PullRequestRequest,
    signal: AbortSignal,
  ): Promise<PullRequest | null> {
    const call = await this.call([
      'pr',
      'list',
      `--repo=${request.url.fullName}`,
      `--head=${request.branch.value}`,
      '--state=all',
      '--json=number,url',
      '--limit=1',
    ]);
    const run = this.loggedIn(await this.gh.run(call, signal), request.url);
    if (run.exitCode !== 0) {
      throw new ToolFailedError(`gh pr list failed. It said: ${run.output}`);
    }
    const listed = parseToolOutput(
      pullRequestListSchema,
      run.stdout,
      'gh pr list',
    );
    return listed[0] ?? null;
  }

  public async openPullRequest(
    request: OpenPullRequestRequest,
    signal: AbortSignal,
  ): Promise<OpenPullRequestResult> {
    const call = await this.call([
      'pr',
      'create',
      `--repo=${request.url.fullName}`,
      `--base=${request.base.value}`,
      `--head=${request.branch.value}`,
      `--title=${request.title}`,
      '--body-file=-',
    ]);
    const run = this.loggedIn(
      await this.gh.run({ ...call, input: request.body }, signal),
      request.url,
    );
    if (run.exitCode !== 0) {
      return { outcome: 'refused', output: run.output };
    }
    const pullRequest = parseToolOutput(
      createdPullRequestSchema,
      run.stdout,
      'gh pr create',
    );
    return { outcome: 'opened', pullRequest };
  }

  /** The run, unless `gh` said it has no login: then that is the fault. */
  private loggedIn(run: ToolRun, url: RepositoryUrl): ToolRun {
    if (run.exitCode === NOT_AUTHENTICATED) {
      throw new GhNotAuthenticatedError(
        `gh is not logged in to ${url.host}. It said: ${run.output}`,
      );
    }
    return run;
  }

  private async call(args: readonly string[]): Promise<ToolCall> {
    await mkdir(this.root, { recursive: true });
    return { arguments: args, directory: this.root };
  }
}
