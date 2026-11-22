import { describe, expect, expectTypeOf, it } from 'vitest';

import type { CommitSha } from '#kernel/primitives/commit-sha';
import {
  type AccessCheckDto,
  type ApplyPatchRequest,
  type ApplyPatchResult,
  type AssessRevisionRequest,
  type ConnectRepositoryRequest,
  type ConnectRepositoryResult,
  type CreateWorkingCopyRequest,
  type ExtractPatchResult,
  type PatchDto,
  type PublishPatchRequest,
  type PublishPatchResult,
  REPOSITORIES_PUBLIC_API,
  type RepositoriesPublicApi,
  REPOSITORY_CONNECTIONS_API,
  type RepositoryConnectionsApi,
  type RepositoryDto,
  type RepositoryRequest,
  type RevisionAssessmentDto,
  type WorkingCopyDto,
  type WorkingCopyRequest,
} from '#repositories/contracts/repositories-public-api';

describe('RepositoriesPublicApi', () => {
  it('should be injected by a token of its own', () => {
    expect(REPOSITORIES_PUBLIC_API.description).toBe('RepositoriesPublicApi');
  });

  it('should answer a repository that is not there with null', () => {
    expectTypeOf<
      RepositoriesPublicApi['getRepository']
    >().returns.resolves.toEqualTypeOf<RepositoryDto | null>();
  });

  it('should take one request object in every operation', () => {
    type Request<Name extends keyof RepositoriesPublicApi> = Parameters<
      RepositoriesPublicApi[Name]
    >[0];

    expectTypeOf<Request<'getRepository'>>().toEqualTypeOf<RepositoryRequest>();
    expectTypeOf<
      Request<'assessRevision'>
    >().toEqualTypeOf<AssessRevisionRequest>();
    expectTypeOf<
      Request<'createWorkingCopy'>
    >().toEqualTypeOf<CreateWorkingCopyRequest>();
    expectTypeOf<
      Request<'disposeWorkingCopy'>
    >().toEqualTypeOf<WorkingCopyRequest>();
    expectTypeOf<Request<'applyPatch'>>().toEqualTypeOf<ApplyPatchRequest>();
    expectTypeOf<
      Request<'publishPatch'>
    >().toEqualTypeOf<PublishPatchRequest>();
  });

  it('should give values, never an aggregate', () => {
    expectTypeOf<
      RepositoriesPublicApi['checkAccess']
    >().returns.resolves.toEqualTypeOf<AccessCheckDto>();
    expectTypeOf<
      RepositoriesPublicApi['createWorkingCopy']
    >().returns.resolves.toEqualTypeOf<WorkingCopyDto>();
    expectTypeOf<WorkingCopyDto['path']>().toEqualTypeOf<string>();
    expectTypeOf<PatchDto['hash']>().toEqualTypeOf<string>();
  });

  it('should take a signal in every operation that reaches the host', () => {
    type Stoppable =
      | 'checkAccess'
      | 'resolveHead'
      | 'assessRevision'
      | 'createWorkingCopy'
      | 'publishPatch';

    expectTypeOf<
      Parameters<RepositoriesPublicApi[Stoppable]>[1]
    >().toEqualTypeOf<AbortSignal>();
  });

  it('should give the head of a scan as a commit', () => {
    expectTypeOf<
      RepositoriesPublicApi['resolveHead']
    >().returns.resolves.toEqualTypeOf<CommitSha>();
  });

  it('should say with a value whether a snapshot is still current', () => {
    expectTypeOf<RevisionAssessmentDto['outcome']>().toEqualTypeOf<
      'current' | 'unchanged' | 'stale' | 'diverged'
    >();
  });

  it('should answer a patch that cannot be used with a value', () => {
    expectTypeOf<ExtractPatchResult['outcome']>().toEqualTypeOf<
      'extracted' | 'empty'
    >();
    expectTypeOf<ApplyPatchResult['outcome']>().toEqualTypeOf<
      'applied' | 'refused'
    >();
    expectTypeOf<PublishPatchResult['outcome']>().toEqualTypeOf<
      'published' | 'refused'
    >();
  });
});

describe('RepositoryConnectionsApi', () => {
  it('should be injected by a token of its own', () => {
    expect(REPOSITORY_CONNECTIONS_API.description).toBe(
      'RepositoryConnectionsApi',
    );
    expect(REPOSITORY_CONNECTIONS_API).not.toBe(REPOSITORIES_PUBLIC_API);
  });

  it('should connect by a request that can be stopped', () => {
    expectTypeOf<
      RepositoryConnectionsApi['connectRepository']
    >().parameters.toEqualTypeOf<[ConnectRepositoryRequest, AbortSignal]>();
  });

  it('should answer an address it cannot connect with a value', () => {
    expectTypeOf<ConnectRepositoryResult['outcome']>().toEqualTypeOf<
      'connected' | 'already_connected' | 'invalid_url' | 'unreachable'
    >();
  });

  it('should list repositories as values', () => {
    expectTypeOf<
      RepositoryConnectionsApi['listRepositories']
    >().returns.resolves.toEqualTypeOf<RepositoryDto[]>();
  });
});
