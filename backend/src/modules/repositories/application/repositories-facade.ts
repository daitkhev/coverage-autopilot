import { Inject, Injectable } from '@nestjs/common';

import type { CommitSha } from '#kernel/primitives/commit-sha';
import { AssessRevisionHandler } from '#repositories/application/commands/assess-revision/assess-revision.handler';
import { CheckAccessHandler } from '#repositories/application/commands/check-access/check-access.handler';
import { CreateWorkingCopyHandler } from '#repositories/application/commands/create-working-copy/create-working-copy.handler';
import { PublishPatchHandler } from '#repositories/application/commands/publish-patch/publish-patch.handler';
import { ResolveHeadHandler } from '#repositories/application/commands/resolve-head/resolve-head.handler';
import type {
  AccessCheckDto,
  ApplyPatchRequest,
  ApplyPatchResult,
  AssessRevisionRequest,
  CreateWorkingCopyRequest,
  ExtractPatchResult,
  PublishPatchRequest,
  PublishPatchResult,
  RepositoriesPublicApi,
  RepositoryDto,
  RepositoryRequest,
  RevisionAssessmentDto,
  WorkingCopyDto,
  WorkingCopyRequest,
} from '#repositories/application/contracts/repositories-public-api';
import {
  WORKING_COPIES,
  type WorkingCopies,
} from '#repositories/application/ports/working-copies.port';
import { GetRepositoryHandler } from '#repositories/application/queries/get-repository/get-repository.handler';
import { WorkingCopyId } from '#repositories/domain/value-objects/working-copy-id.vo';

/**
 * The contract of the module, as other modules call it. A use case with
 * a repository goes to its handler. The work on a copy that exists needs
 * nothing but the copy, so it goes to the working copies straight away.
 */
@Injectable()
export class RepositoriesFacade implements RepositoriesPublicApi {
  private readonly getHandler: GetRepositoryHandler;
  private readonly checkAccessHandler: CheckAccessHandler;
  private readonly resolveHeadHandler: ResolveHeadHandler;
  private readonly assessRevisionHandler: AssessRevisionHandler;
  private readonly createCopyHandler: CreateWorkingCopyHandler;
  private readonly publishHandler: PublishPatchHandler;
  private readonly copies: WorkingCopies;

  public constructor(
    @Inject(GetRepositoryHandler) getHandler: GetRepositoryHandler,
    @Inject(CheckAccessHandler) checkAccessHandler: CheckAccessHandler,
    @Inject(ResolveHeadHandler) resolveHeadHandler: ResolveHeadHandler,
    @Inject(AssessRevisionHandler) assessRevisionHandler: AssessRevisionHandler,
    @Inject(CreateWorkingCopyHandler)
    createCopyHandler: CreateWorkingCopyHandler,
    @Inject(PublishPatchHandler) publishHandler: PublishPatchHandler,
    @Inject(WORKING_COPIES) copies: WorkingCopies,
  ) {
    this.getHandler = getHandler;
    this.checkAccessHandler = checkAccessHandler;
    this.resolveHeadHandler = resolveHeadHandler;
    this.assessRevisionHandler = assessRevisionHandler;
    this.createCopyHandler = createCopyHandler;
    this.publishHandler = publishHandler;
    this.copies = copies;
  }

  public async getRepository(
    request: RepositoryRequest,
  ): Promise<RepositoryDto | null> {
    return this.getHandler.execute(request);
  }

  public async checkAccess(
    request: RepositoryRequest,
    signal: AbortSignal,
  ): Promise<AccessCheckDto | null> {
    return this.checkAccessHandler.execute(
      { repositoryId: request.repositoryId.value },
      signal,
    );
  }

  public async resolveHead(
    request: RepositoryRequest,
    signal: AbortSignal,
  ): Promise<CommitSha> {
    return this.resolveHeadHandler.execute(request, signal);
  }

  public async assessRevision(
    request: AssessRevisionRequest,
    signal: AbortSignal,
  ): Promise<RevisionAssessmentDto> {
    return this.assessRevisionHandler.execute(request, signal);
  }

  public async createWorkingCopy(
    request: CreateWorkingCopyRequest,
    signal: AbortSignal,
  ): Promise<WorkingCopyDto> {
    return this.createCopyHandler.execute(request, signal);
  }

  public async disposeWorkingCopy(request: WorkingCopyRequest): Promise<void> {
    await this.copies.dispose(WorkingCopyId.parse(request.workingCopyId));
  }

  public async extractPatch(
    request: WorkingCopyRequest,
  ): Promise<ExtractPatchResult> {
    return this.copies.extractPatch(WorkingCopyId.parse(request.workingCopyId));
  }

  public async applyPatch(
    request: ApplyPatchRequest,
  ): Promise<ApplyPatchResult> {
    return this.copies.applyPatch(
      WorkingCopyId.parse(request.workingCopyId),
      request.patchText,
    );
  }

  public async publishPatch(
    request: PublishPatchRequest,
    signal: AbortSignal,
  ): Promise<PublishPatchResult> {
    return this.publishHandler.execute(request, signal);
  }
}
