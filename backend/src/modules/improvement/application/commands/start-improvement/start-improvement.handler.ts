import { Inject, Injectable } from '@nestjs/common';

import {
  COVERAGE_PUBLIC_API,
  type CoveragePublicApi,
  type CoverageSnapshotDto,
} from '#coverage/contracts/coverage-public-api';
import { ImprovementRegistration } from '#improvement/application/commands/start-improvement/improvement-registration';
import {
  type AskedImprovement,
  askedImprovementOf,
  canonicalTextOf,
  improvementRequestOf,
} from '#improvement/application/commands/start-improvement/requested-improvement';
import type {
  StartImprovementCommand,
  StartImprovementResult,
  StartRefusal,
} from '#improvement/application/commands/start-improvement/start-improvement.command';
import {
  generatorUnavailable,
  invalidRequest,
  snapshotNotFound,
  staleSnapshot,
  targetNotMeasured,
} from '#improvement/application/commands/start-improvement/start-refusals';
import { ImprovementViews } from '#improvement/application/dto/improvement-views';
import {
  IMPROVEMENT_SETTINGS,
  type ImprovementSettings,
} from '#improvement/application/improvement-settings';
import {
  REQUEST_HASHER,
  type RequestHasher,
} from '#improvement/application/ports/request-hasher.port';
import { requestValueOf } from '#improvement/application/request-values';
import {
  REPOSITORIES_PUBLIC_API,
  type RepositoriesPublicApi,
} from '#repositories/contracts/repositories-public-api';

/** A snapshot the work can start from. */
interface UsableSource {
  readonly outcome: 'usable';
  readonly snapshot: CoverageSnapshotDto;
}

/**
 * Requests an improvement of one file from a snapshot. A generator with no
 * credential refuses every request at once. Every value of the request is
 * made first, so a value that breaks a rule is refused before
 * any call. The request is then checked against the snapshot and the head
 * of the default branch, outside any transaction, because the head is
 * read from the host of the code. Only a request that is still good is
 * registered.
 */
@Injectable()
export class StartImprovementHandler {
  private readonly coverage: CoveragePublicApi;
  private readonly repositories: RepositoriesPublicApi;
  private readonly hasher: RequestHasher;
  private readonly registration: ImprovementRegistration;
  private readonly views: ImprovementViews;
  private readonly settings: ImprovementSettings;

  public constructor(
    @Inject(COVERAGE_PUBLIC_API) coverage: CoveragePublicApi,
    @Inject(REPOSITORIES_PUBLIC_API) repositories: RepositoriesPublicApi,
    @Inject(REQUEST_HASHER) hasher: RequestHasher,
    @Inject(ImprovementRegistration) registration: ImprovementRegistration,
    @Inject(ImprovementViews) views: ImprovementViews,
    @Inject(IMPROVEMENT_SETTINGS) settings: ImprovementSettings,
  ) {
    this.coverage = coverage;
    this.repositories = repositories;
    this.hasher = hasher;
    this.registration = registration;
    this.views = views;
    this.settings = settings;
  }

  public async execute(
    command: StartImprovementCommand,
    signal: AbortSignal,
  ): Promise<StartImprovementResult> {
    if (this.settings.missingCredential !== null) {
      return generatorUnavailable(this.settings.missingCredential);
    }
    const asked = requestValueOf(() =>
      askedImprovementOf(command, this.settings),
    );
    if (asked.outcome === 'invalid') {
      return invalidRequest(asked.message);
    }
    const source = await this.sourceOf(asked.value, signal);
    if (source.outcome === 'refused') {
      return source;
    }
    const fingerprint = this.hasher.fingerprintOf(
      canonicalTextOf(asked.value, source.snapshot),
    );
    const registered = await this.registration.register(
      improvementRequestOf(asked.value, source.snapshot, fingerprint),
    );
    return registered.outcome === 'refused'
      ? registered
      : {
          outcome: registered.outcome,
          improvement: await this.views.of(registered.improvement),
        };
  }

  /**
   * The snapshot is there, it measured the file, and the file has not
   * changed on the default branch since its commit. A file above the
   * threshold is not refused: the fresh measurement of the run decides.
   */
  private async sourceOf(
    asked: AskedImprovement,
    signal: AbortSignal,
  ): Promise<UsableSource | StartRefusal> {
    const snapshotId = asked.snapshotId.value;
    const snapshot = await this.coverage.getSnapshot({ snapshotId });
    if (snapshot === null) {
      return snapshotNotFound(asked);
    }
    const file = await this.coverage.getFileCoverage({
      snapshotId,
      path: asked.targetFile,
    });
    if (file?.state !== 'measured') {
      return targetNotMeasured(asked);
    }
    const revision = await this.repositories.assessRevision(
      {
        repositoryId: snapshot.repositoryId,
        snapshotCommit: snapshot.commit,
        targetFile: asked.targetFile,
      },
      signal,
    );
    return revision.outcome === 'stale' || revision.outcome === 'diverged'
      ? staleSnapshot(asked, snapshot.commit, revision.outcome)
      : { outcome: 'usable', snapshot };
  }
}
