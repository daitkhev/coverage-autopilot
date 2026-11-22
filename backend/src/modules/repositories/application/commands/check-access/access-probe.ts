import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '#kernel/time/clock';
import {
  gitVersionOf,
  isOlder,
  OLDEST_GIT,
  versionText,
} from '#repositories/application/commands/check-access/git-version';
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
  type Destination,
} from '#repositories/domain/value-objects/access-check.vo';
import type { RepositoryUrl } from '#repositories/domain/value-objects/repository-url.vo';

type FailedStep = Extract<AccessStepOutcome, { readonly status: 'failed' }>;

/** Where a result goes, and the words the last step passes with. */
interface Route {
  readonly status: 'routed';
  readonly message: string;
  readonly destination: Destination;
}

const TO_REPOSITORY: Destination = { route: 'repository' };

function failed(message: string, toolOutput: string | null = null): FailedStep {
  return { status: 'failed', message, toolOutput };
}

function routed(message: string, destination: Destination): Route {
  return { status: 'routed', message, destination };
}

function notInstalled(tool: string): AccessStepOutcome {
  return failed(
    `${tool} is not installed, or not on the PATH of the service. Install it and check again.`,
  );
}

const NEEDED_GIT = `git ${versionText(OLDEST_GIT)} or newer`;

/** A git that is too old is a failed step, not a fault: the user can act. */
function gitVersionStep(answer: string): AccessStepOutcome {
  const version = gitVersionOf(answer);
  if (version === null) {
    return failed(
      `git answered with no version the service can read, and it needs ${NEEDED_GIT}.`,
      answer,
    );
  }
  return isOlder(version, OLDEST_GIT)
    ? failed(
        `Found ${answer}, and the service needs ${NEEDED_GIT}. Install it and check again.`,
      )
    : { status: 'passed', message: `Found ${answer}.` };
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
      ? gitVersionStep(found.version)
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

  /**
   * Asks the host where a result goes, then reads the head with git, which
   * also pushes. It runs only once the step before found the login, so a
   * login missing here was lost meanwhile, and is the fault of the host.
   */
  private async pushAllowed(
    repository: Repository,
    signal: AbortSignal,
  ): Promise<AccessStepOutcome> {
    const route = await this.routeOf(repository.url, signal);
    return route.status === 'failed'
      ? route
      : this.headOf(repository, route, signal);
  }

  /**
   * The repository, when the account may push to it. Otherwise a result
   * goes to a fork in the account, which publishing makes when it needs it.
   */
  private async routeOf(
    url: RepositoryUrl,
    signal: AbortSignal,
  ): Promise<Route | FailedStep> {
    const name = url.fullName;
    const permission = await this.host.pushPermission(url, signal);
    if (permission.outcome === 'refused') {
      return failed(
        `gh could not ask the host about ${name}.`,
        permission.output,
      );
    }
    if (permission.outcome === 'allowed') {
      return routed(`The account may push to ${name}.`, TO_REPOSITORY);
    }
    const account = await this.host.account(url.host, signal);
    return account.outcome === 'read'
      ? routed(
          `The account may not push to ${name}. A result goes to a fork in the account ${account.login}.`,
          { route: 'fork', account: account.login },
        )
      : failed(
          `The account may not push to ${name}, and gh could not name the account a fork would be in.`,
          account.output,
        );
  }

  private async headOf(
    repository: Repository,
    route: Route,
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
          message: route.message,
          headCommit: read.commit,
          destination: route.destination,
        }
      : failed(`git could not read ${name}.`, read.output);
  }
}
