import { Inject, Injectable } from '@nestjs/common';

import type { ChangeInstallModeCommand } from '#repositories/application/commands/change-install-mode/change-install-mode.command';
import type { RepositoryViewDto } from '#repositories/application/dto/repository-view.dto';
import { RepositoryChanges } from '#repositories/application/repository-changes';

/**
 * Gives a repository a mode of install of its own, or the default of the
 * service back. A copy is installed by the mode its repository has when
 * the copy is prepared, so a scan or an improvement under way keeps the
 * mode it began with until its next copy. `null` when no repository has
 * the id.
 */
@Injectable()
export class ChangeInstallModeHandler {
  private readonly changes: RepositoryChanges;

  public constructor(@Inject(RepositoryChanges) changes: RepositoryChanges) {
    this.changes = changes;
  }

  public async execute(
    command: ChangeInstallModeCommand,
  ): Promise<RepositoryViewDto | null> {
    return this.changes.change(command.repositoryId, (repository) => {
      repository.changeInstallMode(command.mode);
    });
  }
}
