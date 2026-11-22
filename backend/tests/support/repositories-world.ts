import { RepositoryId } from '#kernel/primitives/repository-id';
import { AssessRevisionHandler } from '#repositories/application/commands/assess-revision/assess-revision.handler';
import { ChangeThresholdHandler } from '#repositories/application/commands/change-threshold/change-threshold.handler';
import { AccessProbe } from '#repositories/application/commands/check-access/access-probe';
import { CheckAccessHandler } from '#repositories/application/commands/check-access/check-access.handler';
import { ConnectRepositoryHandler } from '#repositories/application/commands/connect-repository/connect-repository.handler';
import { CreateWorkingCopyHandler } from '#repositories/application/commands/create-working-copy/create-working-copy.handler';
import { PublishPatchHandler } from '#repositories/application/commands/publish-patch/publish-patch.handler';
import { ResolveHeadHandler } from '#repositories/application/commands/resolve-head/resolve-head.handler';
import { RepositoryViews } from '#repositories/application/dto/repository-views';
import { HeadRecorder } from '#repositories/application/head-recorder';
import { GetRepositoryHandler } from '#repositories/application/queries/get-repository/get-repository.handler';
import { GetRepositoryViewHandler } from '#repositories/application/queries/get-repository-view/get-repository-view.handler';
import { ListRepositoriesHandler } from '#repositories/application/queries/list-repositories/list-repositories.handler';
import { RepositoriesFacade } from '#repositories/application/repositories-facade';
import { Repository } from '#repositories/domain/entities/repository.entity';
import { BranchName } from '#repositories/domain/value-objects/branch-name.vo';
import { RepositoryUrl } from '#repositories/domain/value-objects/repository-url.vo';
import { DEFAULT_TEST_THRESHOLD } from '#tests/support/coverage-snapshots';
import { FixedClock } from '#tests/support/fixed-clock';
import { InMemoryRepositoryRepository } from '#tests/support/in-memory-repository-repository';
import { InlineTransactions } from '#tests/support/inline-transactions';
import { STORED_TIME } from '#tests/support/schema-rows';
import { ScriptedCodeHost } from '#tests/support/scripted-code-host';
import { ScriptedGit } from '#tests/support/scripted-git';
import { ScriptedWorkingCopies } from '#tests/support/scripted-working-copies';
import { SequentialIdGenerator } from '#tests/support/sequential-id-generator';
import { standInRepositoryCoverage } from '#tests/support/stand-in-repository-coverage';

/** The id `connected` gives `acme/widgets`, apart from the generated ones. */
export const WIDGETS_ID = RepositoryId.create(
  '00000000-0000-4000-8000-0000000000aa',
);

/**
 * The application of the repositories module over stand-ins in memory:
 * a store, transactions, `git`, the host of the code, the copies and the
 * coverage module. A test sets their answers and reads what each was
 * asked.
 */
export class RepositoriesWorld {
  public readonly repositories = new InMemoryRepositoryRepository();
  public readonly transactions = new InlineTransactions();
  public readonly git = new ScriptedGit();
  public readonly host = new ScriptedCodeHost();
  public readonly copies = new ScriptedWorkingCopies();
  public readonly clock = new FixedClock(STORED_TIME);
  public readonly ids = new SequentialIdGenerator();
  public readonly coverage = standInRepositoryCoverage();
  public readonly views = new RepositoryViews(
    this.coverage,
    DEFAULT_TEST_THRESHOLD,
  );
  public readonly heads = new HeadRecorder(
    this.repositories,
    this.transactions,
  );
  public readonly probe = new AccessProbe(this.git, this.host, this.clock);

  public readonly connect = new ConnectRepositoryHandler(
    this.repositories,
    this.git,
    this.transactions,
    this.clock,
    this.ids,
    this.views,
  );
  public readonly changeThreshold = new ChangeThresholdHandler(
    this.repositories,
    this.transactions,
    this.views,
  );
  public readonly getRepository = new GetRepositoryHandler(
    this.repositories,
    DEFAULT_TEST_THRESHOLD,
  );
  public readonly getRepositoryView = new GetRepositoryViewHandler(
    this.repositories,
    this.views,
  );
  public readonly listRepositories = new ListRepositoriesHandler(
    this.repositories,
    this.views,
  );
  public readonly checkAccess = new CheckAccessHandler(
    this.repositories,
    this.probe,
    this.heads,
  );
  public readonly resolveHead = new ResolveHeadHandler(
    this.repositories,
    this.git,
    this.heads,
    this.clock,
  );
  public readonly assessRevision = new AssessRevisionHandler(
    this.repositories,
    this.git,
    this.heads,
    this.clock,
  );
  public readonly createWorkingCopy = new CreateWorkingCopyHandler(
    this.repositories,
    this.copies,
  );
  public readonly publishPatch = new PublishPatchHandler(
    this.repositories,
    this.git,
    this.host,
    this.copies,
  );
  public readonly facade = new RepositoriesFacade(
    this.getRepository,
    this.checkAccess,
    this.resolveHead,
    this.assessRevision,
    this.createWorkingCopy,
    this.publishPatch,
    this.copies,
  );

  /** `acme/widgets` on `main`, connected before the test, no head read. */
  public async connected(): Promise<Repository> {
    const repository = Repository.connect(WIDGETS_ID, {
      url: RepositoryUrl.parse('https://github.com/acme/widgets'),
      defaultBranch: BranchName.create('main'),
      connectedAt: this.clock.now(),
    });
    await this.repositories.save(repository, this.transactions.transaction);
    this.repositories.saves.length = 0;
    return repository;
  }
}
