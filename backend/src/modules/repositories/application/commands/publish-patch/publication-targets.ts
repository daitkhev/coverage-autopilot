import { Inject, Injectable } from '@nestjs/common';

import type { CommitSha } from '#kernel/primitives/commit-sha';
import { CLOCK, type Clock } from '#kernel/time/clock';
import type { Instant } from '#kernel/time/instant';
import { ALARM, type Alarm } from '#ports/alarm.port';
import { ForkNotReadyError } from '#repositories/application/errors/fork-not-ready.error';
import { PermissionNotReadError } from '#repositories/application/errors/permission-not-read.error';
import {
  CODE_HOST,
  type CodeHost,
} from '#repositories/application/ports/code-host.port';
import { GIT, type Git } from '#repositories/application/ports/git.port';
import type { Repository } from '#repositories/domain/entities/repository.entity';
import { BranchName } from '#repositories/domain/value-objects/branch-name.vo';
import type { RepositoryUrl } from '#repositories/domain/value-objects/repository-url.vo';

/**
 * How long a new fork may take before git reaches it, and how often git
 * looks. The host makes one in seconds, and asks to be told of one that
 * takes minutes. A wait that runs out is a fault, which a later run of
 * the job may not meet.
 */
const FORK_WAIT_MS = 60_000;
const LOOK_INTERVAL_MS = 2_000;

/**
 * The base of a pull request in a fork is a branch named by the whole
 * base commit, so two commits never share one and a push never moves it.
 */
const BASE_PREFIX = 'coverage-autopilot/base-';

/**
 * Where a publication goes: the repository and its default branch, or a
 * fork in the account and a branch at the base commit, which goes to the
 * fork with the tests.
 */
export interface Target {
  readonly route: 'repository' | 'fork';
  readonly url: RepositoryUrl;
  /** The branch the pull request goes into. */
  readonly base: BranchName;
}

/** `refused`: the host would not make the fork, in its own words. */
export type TargetResult =
  | { readonly outcome: 'found'; readonly target: Target }
  | { readonly outcome: 'refused'; readonly reason: string };

/**
 * Waits until the alarm rings, or throws the reason of the signal once it
 * aborts. The alarm is taken back either way, so no timer outlives it.
 */
async function pauseUntil(
  alarm: Alarm,
  moment: Instant,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  const { promise, resolve } = Promise.withResolvers<undefined>();
  const end = (): void => {
    resolve(undefined);
  };
  signal.addEventListener('abort', end, { once: true });
  const cancel = alarm.set(moment, end);
  try {
    await promise;
    signal.throwIfAborted();
  } finally {
    cancel();
    signal.removeEventListener('abort', end);
  }
}

/**
 * Decides where a publication goes by the right of the account to push:
 * to the repository when it may, and to its fork in the account when it
 * may not. A pull request in a repository it may not push to is never
 * opened. The fork is asked for each time, and the host answers with the
 * one the account has, so a call made again makes no second fork.
 */
@Injectable()
export class PublicationTargets {
  private readonly host: CodeHost;
  private readonly git: Git;
  private readonly clock: Clock;
  private readonly alarm: Alarm;

  public constructor(
    @Inject(CODE_HOST) host: CodeHost,
    @Inject(GIT) git: Git,
    @Inject(CLOCK) clock: Clock,
    @Inject(ALARM) alarm: Alarm,
  ) {
    this.host = host;
    this.git = git;
    this.clock = clock;
    this.alarm = alarm;
  }

  public async of(
    repository: Repository,
    baseCommit: CommitSha,
    signal: AbortSignal,
  ): Promise<TargetResult> {
    const { url } = repository;
    const permission = await this.host.pushPermission(url, signal);
    if (permission.outcome === 'refused') {
      throw new PermissionNotReadError(
        `gh could not ask the host whether the account may push to ${url.fullName}. It said: ${permission.output}`,
      );
    }
    return permission.outcome === 'allowed'
      ? {
          outcome: 'found',
          target: { route: 'repository', url, base: repository.defaultBranch },
        }
      : this.forkOf(url, baseCommit, signal);
  }

  private async forkOf(
    url: RepositoryUrl,
    baseCommit: CommitSha,
    signal: AbortSignal,
  ): Promise<TargetResult> {
    const forked = await this.host.ensureFork(url, signal);
    if (forked.outcome === 'refused') {
      return { outcome: 'refused', reason: forked.output };
    }
    await this.reached(forked.fork, signal);
    const base = BranchName.create(`${BASE_PREFIX}${baseCommit.value}`);
    return {
      outcome: 'found',
      target: { route: 'fork', url: forked.fork, base },
    };
  }

  /** A fork git reaches names its default branch. */
  private async reached(
    fork: RepositoryUrl,
    signal: AbortSignal,
  ): Promise<void> {
    const deadline = this.clock.now().plusMilliseconds(FORK_WAIT_MS);
    let read = await this.git.readDefaultBranch(fork, signal);
    while (read.outcome === 'refused') {
      const next = this.clock.now().plusMilliseconds(LOOK_INTERVAL_MS);
      if (deadline.isBefore(next)) {
        throw new ForkNotReadyError(
          `git did not reach the fork ${fork.fullName} within ${String(FORK_WAIT_MS)} ms of asking for it. It said: ${read.output}`,
        );
      }
      await pauseUntil(this.alarm, next, signal);
      read = await this.git.readDefaultBranch(fork, signal);
    }
  }
}
