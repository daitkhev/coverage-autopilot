import { Inject, Injectable } from '@nestjs/common';

import type { WorkingCopyLoan } from '#coverage/application/contracts/coverage-public-api';
import { MissingRepositoryError } from '#coverage/application/errors/missing-repository.error';
import {
  PROJECT_DETECTOR,
  type ProjectDetection,
  type ProjectDetector,
  type UnsupportedProject,
} from '#coverage/application/ports/project-detector.port';
import type { RepositoryId } from '#kernel/primitives/repository-id';
import {
  REPOSITORIES_PUBLIC_API,
  type RepositoriesPublicApi,
  type RepositoryDto,
} from '#repositories/application/contracts/repositories-public-api';

/**
 * Only a sandboxed install refuses what would run code, so the refusal
 * says how to lift it, with the command a person types.
 */
function advised(
  refusal: UnsupportedProject,
  repository: RepositoryDto,
): UnsupportedProject {
  const name = `${repository.owner}/${repository.name}`;
  return refusal.reason === 'install_runs_code'
    ? {
        ...refusal,
        detail:
          `${refusal.detail} Trust the repository to install it as its ` +
          `developers do: repo trust ${name} trusted.`,
      }
    : refusal;
}

/**
 * Detects the project of a lent copy as its repository is installed now.
 * The mode is asked of the module of repositories each time and never
 * kept here, so a change counts from the next copy detected.
 */
@Injectable()
export class RepositoryDetection {
  private readonly repositories: RepositoriesPublicApi;
  private readonly detector: ProjectDetector;

  public constructor(
    @Inject(REPOSITORIES_PUBLIC_API) repositories: RepositoriesPublicApi,
    @Inject(PROJECT_DETECTOR) detector: ProjectDetector,
  ) {
    this.repositories = repositories;
    this.detector = detector;
  }

  public async detect(loan: WorkingCopyLoan): Promise<ProjectDetection> {
    const repository = await this.repositoryOf(loan.repositoryId);
    const detection = await this.detector.detect(
      loan.workingCopyPath,
      repository.install.mode,
    );
    return detection.outcome === 'unsupported'
      ? advised(detection, repository)
      : detection;
  }

  private async repositoryOf(
    repositoryId: RepositoryId,
  ): Promise<RepositoryDto> {
    const repository = await this.repositories.getRepository({ repositoryId });
    if (repository === null) {
      throw new MissingRepositoryError(
        `No connected repository has the id ${repositoryId.value}, which ` +
          'a working copy names.',
      );
    }
    return repository;
  }
}
