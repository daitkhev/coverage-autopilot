import { Inject, Injectable } from '@nestjs/common';

import type { ChangeThresholdCommand } from '#repositories/application/commands/change-threshold/change-threshold.command';
import type { RepositoryViewDto } from '#repositories/application/dto/repository-view.dto';
import { RepositoryChanges } from '#repositories/application/repository-changes';
import { ThresholdPercentage } from '#repositories/domain/value-objects/threshold-percentage.vo';

/** No percent of its own is the default of the service. */
function thresholdOf(percentage: number | null): ThresholdPercentage | null {
  return percentage === null ? null : ThresholdPercentage.create(percentage);
}

/**
 * Gives a repository a threshold of its own, or the default of the
 * service back. The old one is not kept anywhere, so every snapshot of
 * the repository is judged by the new one from the next read. `null` when
 * no repository has the id.
 */
@Injectable()
export class ChangeThresholdHandler {
  private readonly changes: RepositoryChanges;

  public constructor(@Inject(RepositoryChanges) changes: RepositoryChanges) {
    this.changes = changes;
  }

  public async execute(
    command: ChangeThresholdCommand,
  ): Promise<RepositoryViewDto | null> {
    return this.changes.change(command.repositoryId, (repository) => {
      repository.changeThreshold(thresholdOf(command.percentage));
    });
  }
}
