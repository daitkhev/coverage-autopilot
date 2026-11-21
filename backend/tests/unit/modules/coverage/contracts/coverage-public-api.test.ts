import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  type CaptureSnapshotRequest,
  type CaptureSnapshotResult,
  COVERAGE_PUBLIC_API,
  type CoveragePublicApi,
  type CoverageSnapshotDto,
  type FileCoverageDto,
  type FileCoverageRequest,
  type PrepareProjectResult,
  type RunTestsRequest,
  type RunTestsResult,
  type SnapshotRequest,
  type UnmeasuredFileDto,
  type WorkingCopyLoan,
} from '#coverage/contracts/coverage-public-api';
import { REPOSITORIES_PUBLIC_API } from '#repositories/contracts/repositories-public-api';

describe('CoveragePublicApi', () => {
  it('should be injected by a token of its own', () => {
    expect(COVERAGE_PUBLIC_API.description).toBe('CoveragePublicApi');
    expect(COVERAGE_PUBLIC_API).not.toBe(REPOSITORIES_PUBLIC_API);
  });

  it('should take one request object in every operation', () => {
    type Request<Name extends keyof CoveragePublicApi> = Parameters<
      CoveragePublicApi[Name]
    >[0];

    expectTypeOf<
      Request<'captureSnapshot'>
    >().toEqualTypeOf<CaptureSnapshotRequest>();
    expectTypeOf<Request<'prepareProject'>>().toEqualTypeOf<WorkingCopyLoan>();
    expectTypeOf<Request<'runTests'>>().toEqualTypeOf<RunTestsRequest>();
    expectTypeOf<Request<'getSnapshot'>>().toEqualTypeOf<SnapshotRequest>();
    expectTypeOf<
      Request<'getFileCoverage'>
    >().toEqualTypeOf<FileCoverageRequest>();
  });

  it('should take a signal in every operation that runs a tool', () => {
    type Stoppable = 'captureSnapshot' | 'prepareProject' | 'runTests';

    expectTypeOf<
      Parameters<CoveragePublicApi[Stoppable]>[1]
    >().toEqualTypeOf<AbortSignal>();
  });

  it('should answer a project it cannot measure with a value', () => {
    expectTypeOf<CaptureSnapshotResult['outcome']>().toEqualTypeOf<
      'captured' | 'unsupported' | 'install_failed' | 'test_run_timed_out'
    >();
    expectTypeOf<PrepareProjectResult['outcome']>().toEqualTypeOf<
      'ready' | 'unsupported' | 'install_failed'
    >();
    expectTypeOf<RunTestsResult['outcome']>().toEqualTypeOf<
      'completed' | 'unsupported'
    >();
  });

  it('should answer what is not there with null', () => {
    expectTypeOf<
      CoveragePublicApi['getSnapshot']
    >().returns.resolves.toEqualTypeOf<CoverageSnapshotDto | null>();
    expectTypeOf<
      CoveragePublicApi['getFileCoverage']
    >().returns.resolves.toEqualTypeOf<FileCoverageDto | null>();
  });

  it('should give an unmeasured file a reason and no percentage', () => {
    expectTypeOf<UnmeasuredFileDto>().not.toHaveProperty('counters');
    expectTypeOf<UnmeasuredFileDto['reason']>().toEqualTypeOf<
      'parse_failed' | 'missing_from_report' | 'no_counters'
    >();
  });
});
