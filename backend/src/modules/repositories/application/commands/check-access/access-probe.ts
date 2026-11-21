import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '#kernel/time/clock';
import {
  CODE_HOST,
  type CodeHost,
} from '#repositories/application/ports/code-host.port';
import { GIT, type Git } from '#repositories/application/ports/git.port';
import type { Repository } from '#repositories/domain/entities/repository.entity';
import {
  AccessCheck,
  type AccessStepName,
  type AccessStepOutcome,
} from '#repositories/domain/value-objects/access-check.vo';
import type { RepositoryUrl } from '#repositories/domain/value-objects/repository-url.vo';

function failed(
  message: string,
  toolOutput: string | null = null,
): AccessStepOutcome {
  return { status: 'failed', message, toolOutput };
}

function notInstalled(tool: string): AccessStepOutcome {
  return failed(
    `${tool} is not installed, or not on the PATH of the service. Install it and check again.`,
  );
}

/**
 * Runs the steps of the access check against the tools of the host, one
 * at a time, until one fails or all have passed. Each step says what the
 * user can do about a failure, and keeps the answer of the tool.
 */
@Injectable()
export class AccessProbe {
  private readonly git: Git;
  private readonly host: CodeHost;
  private readonly clock: Clock;

  public constructor(
    @Inject(GIT) git: Git,
    @Inject(CODE_HOST) host: CodeHost,
    @Inject(CLOCK) clock: Clock,
  ) {
    this.git = git;
    this.host = host;
    this.clock = clock;
  }

  public async run(
    repository: Repository,
    signal: AbortSignal,
  ): Promise<AccessCheck> {
    let check = AccessCheck.begin(this.clock.now());
    for (let step = check.nextStep(); step !== null; step = check.nextStep()) {
      check = check.record(await this.probe(step, repository, signal));
    }
    return check;
  }

  private async probe(
    step: AccessStepName,
    repository: Repository,
    signal: AbortSignal,
  ): Promise<AccessStepOutcome> {
    switch (step) {
      case 'git_present':
        return this.gitPresent(signal);
      case 'gh_authenticated':
        return this.ghAuthenticated(repository.url, signal);
      case 'push_allowed':
        return this.pushAllowed(repository, signal);
    }
  }

  private async gitPresent(signal: AbortSignal): Promise<AccessStepOutcome> {
    const found = await this.git.version(signal);
    return found.outcome === 'found'
      ? { status: 'passed', message: `Found ${found.version}.` }
      : notInstalled('git');
  }

  private async ghAuthenticated(
    url: RepositoryUrl,
    signal: AbortSignal,
  ): Promise<AccessStepOutcome> {
    const login = await this.host.loginStatus(url.host, signal);
    if (login.outcome === 'missing') {
      return notInstalled('gh');
    }
    return login.outcome === 'logged_in'
      ? { status: 'passed', message: `gh is logged in to ${url.host}.` }
      : failed(
          `gh is not logged in to ${url.host}. Run gh auth login and check again.`,
          login.output,
        );
  }

  /** Asks the host, then reads the head with git, which also pushes. */
  private async pushAllowed(
    repository: Repository,
    signal: AbortSignal,
  ): Promise<AccessStepOutcome> {
    const name = repository.url.fullName;
    const permission = await this.host.pushPermission(repository.url, signal);
    if (permission.outcome === 'denied') {
      return failed(
        `The account of gh may not push to ${name}. Ask for write access and check again.`,
      );
    }
    return permission.outcome === 'refused'
      ? failed(`gh could not ask the host about ${name}.`, permission.output)
      : this.headOf(repository, signal);
  }

  private async headOf(
    repository: Repository,
    signal: AbortSignal,
  ): Promise<AccessStepOutcome> {
    const name = repository.url.fullName;
    const branch = repository.defaultBranch.value;
    const read = await this.git.readBranchHead(
      { url: repository.url, branch: repository.defaultBranch },
      signal,
    );
    if (read.outcome === 'absent') {
      return failed(`${name} has no branch ${branch} any more.`);
    }
    return read.outcome === 'read'
      ? {
          status: 'passed',
          message: `The account may push to ${name}.`,
          headCommit: read.commit,
        }
      : failed(`git could not read ${name}.`, read.output);
  }
}
