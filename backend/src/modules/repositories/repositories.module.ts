import {
  type DynamicModule,
  Inject,
  Module,
  type OnModuleInit,
} from '@nestjs/common';

import { AssessRevisionHandler } from '#repositories/application/commands/assess-revision/assess-revision.handler';
import { AccessProbe } from '#repositories/application/commands/check-access/access-probe';
import { CheckAccessHandler } from '#repositories/application/commands/check-access/check-access.handler';
import { ConnectRepositoryHandler } from '#repositories/application/commands/connect-repository/connect-repository.handler';
import { CreateWorkingCopyHandler } from '#repositories/application/commands/create-working-copy/create-working-copy.handler';
import { PublishPatchHandler } from '#repositories/application/commands/publish-patch/publish-patch.handler';
import { ResolveHeadHandler } from '#repositories/application/commands/resolve-head/resolve-head.handler';
import { REPOSITORIES_PUBLIC_API } from '#repositories/application/contracts/repositories-public-api';
import { RepositoryViews } from '#repositories/application/dto/repository-views';
import { HeadRecorder } from '#repositories/application/head-recorder';
import { CODE_HOST } from '#repositories/application/ports/code-host.port';
import { GIT } from '#repositories/application/ports/git.port';
import { WORKING_COPIES } from '#repositories/application/ports/working-copies.port';
import { GetRepositoryHandler } from '#repositories/application/queries/get-repository/get-repository.handler';
import { GetRepositoryViewHandler } from '#repositories/application/queries/get-repository-view/get-repository-view.handler';
import { ListRepositoriesHandler } from '#repositories/application/queries/list-repositories/list-repositories.handler';
import { RepositoriesFacade } from '#repositories/application/repositories-facade';
import { REPOSITORY_REPOSITORY } from '#repositories/domain/repositories/repository.repository';
import { GhCodeHost } from '#repositories/infrastructure/gh/gh-code-host.adapter';
import { GitCli } from '#repositories/infrastructure/git/git-cli.adapter';
import { GitWorkingCopies } from '#repositories/infrastructure/git/git-working-copies.adapter';
import { RepositoriesController } from '#repositories/infrastructure/http/repositories.controller';
import { RepositoryAccessController } from '#repositories/infrastructure/http/repository-access.controller';
import { SqliteRepositoryRepository } from '#repositories/infrastructure/persistence/sqlite-repository.repository';
import {
  REPOSITORIES_SETTINGS,
  type RepositoriesSettings,
} from '#repositories/infrastructure/repositories-settings';
import { checkSettings } from '#repositories/infrastructure/repositories-settings.schema';

/** The use cases behind the contract and the routes of the module. */
const HANDLERS = [
  ConnectRepositoryHandler,
  CheckAccessHandler,
  ResolveHeadHandler,
  AssessRevisionHandler,
  CreateWorkingCopyHandler,
  PublishPatchHandler,
  GetRepositoryHandler,
  GetRepositoryViewHandler,
  ListRepositoriesHandler,
];

/**
 * Everything that uses `git` and `gh`, and the routes of a repository:
 * connecting one, the list, one repository and its access check. It takes
 * the clock, the id generator, the transaction manager and the SQLite
 * connection from the shared infrastructure, and its own settings from
 * `register`. An answer about a repository holds what only the coverage
 * module knows, which is above this one: it comes through the port
 * `REPOSITORY_COVERAGE` of this module, which the coverage module binds.
 */
@Module({})
export class RepositoriesModule implements OnModuleInit {
  private readonly settings: RepositoriesSettings;

  public constructor(
    @Inject(REPOSITORIES_SETTINGS) settings: RepositoriesSettings,
  ) {
    this.settings = settings;
  }

  /**
   * The module with its settings. It is global, so every module that
   * injects the contract gets the one instance, and the working copies
   * have one owner of their folders.
   */
  public static register(settings: RepositoriesSettings): DynamicModule {
    return {
      module: RepositoriesModule,
      global: true,
      controllers: [RepositoriesController, RepositoryAccessController],
      providers: [
        { provide: REPOSITORIES_SETTINGS, useValue: settings },
        {
          provide: REPOSITORY_REPOSITORY,
          useClass: SqliteRepositoryRepository,
        },
        { provide: GIT, useClass: GitCli },
        { provide: CODE_HOST, useClass: GhCodeHost },
        { provide: WORKING_COPIES, useClass: GitWorkingCopies },
        { provide: REPOSITORIES_PUBLIC_API, useClass: RepositoriesFacade },
        HeadRecorder,
        RepositoryViews,
        AccessProbe,
        ...HANDLERS,
      ],
      exports: [REPOSITORIES_PUBLIC_API],
    };
  }

  /** Settings that cannot work stop the start, not the first clone. */
  public onModuleInit(): void {
    checkSettings(this.settings);
  }
}
