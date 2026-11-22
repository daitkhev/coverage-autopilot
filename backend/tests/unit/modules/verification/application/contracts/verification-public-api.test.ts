import { describe, expect, expectTypeOf, it } from 'vitest';

import { COVERAGE_PUBLIC_API } from '#coverage/application/contracts/coverage-public-api';
import type {
  BaselineProgress,
  CheckName,
  CheckProgress,
  CheckResultDto,
  CheckStatus,
  MeasureBaselineRequest,
  MeasureBaselineResult,
  MutantCountsDto,
  MutantDto,
  MutationBaselineDto,
  ProgressObserver,
  QualityPolicyDto,
  SurvivingMutantDto,
  TargetCoverageDto,
  UndetectedMutantDto,
  VerificationBaselineDto,
  VerificationPublicApi,
  VerificationReportDto,
  VerifyPatchRequest,
} from '#verification/application/contracts/verification-public-api';
import { VERIFICATION_PUBLIC_API } from '#verification/application/contracts/verification-public-api';

describe('VerificationPublicApi', () => {
  it('should be injected by a token of its own', () => {
    expect(VERIFICATION_PUBLIC_API.description).toBe('VerificationPublicApi');
    expect(VERIFICATION_PUBLIC_API).not.toBe(COVERAGE_PUBLIC_API);
  });

  it('should take one request object and a signal in both operations', () => {
    type Operation = keyof VerificationPublicApi;

    expectTypeOf<
      Parameters<VerificationPublicApi['measureBaseline']>[0]
    >().toEqualTypeOf<MeasureBaselineRequest>();
    expectTypeOf<
      Parameters<VerificationPublicApi['verifyPatch']>[0]
    >().toEqualTypeOf<VerifyPatchRequest>();
    expectTypeOf<
      Parameters<VerificationPublicApi[Operation]>[1]
    >().toEqualTypeOf<AbortSignal>();
  });

  it('should answer a commit it cannot verify with a value', () => {
    expectTypeOf<MeasureBaselineResult['outcome']>().toEqualTypeOf<
      'measured' | 'unsupported' | 'timed_out'
    >();
  });

  it('should give the baseline back to the call that verifies a patch', () => {
    expectTypeOf<
      VerifyPatchRequest['baseline']
    >().toEqualTypeOf<VerificationBaselineDto>();
    expectTypeOf<
      VerificationBaselineDto['mutation']
    >().toEqualTypeOf<MutationBaselineDto | null>();
    expectTypeOf<MutationBaselineDto['undetected']>().toEqualTypeOf<
      readonly UndetectedMutantDto[]
    >();
  });

  it('should name a mutant by what it is and not by the id of a tool', () => {
    expectTypeOf<keyof MutantDto>().toEqualTypeOf<
      | 'file'
      | 'mutator'
      | 'startLine'
      | 'startColumn'
      | 'endLine'
      | 'endColumn'
      | 'replacement'
    >();
    expectTypeOf<UndetectedMutantDto['status']>().toEqualTypeOf<
      'survived' | 'no_coverage'
    >();
  });

  it('should give every check one of five statuses', () => {
    expectTypeOf<CheckResultDto['name']>().toEqualTypeOf<CheckName>();
    expectTypeOf<CheckResultDto['status']>().toEqualTypeOf<CheckStatus>();
    expectTypeOf<CheckStatus>().toEqualTypeOf<
      'passed' | 'failed' | 'skipped' | 'not_applicable' | 'error'
    >();
    expectTypeOf<QualityPolicyDto['requiredChecks']>().toEqualTypeOf<
      readonly CheckName[]
    >();
  });

  it('should decide a patch with one of three verdicts', () => {
    expectTypeOf<VerificationReportDto['verdict']>().toEqualTypeOf<
      'accepted' | 'rejected' | 'inconclusive'
    >();
    expectTypeOf<
      VerificationPublicApi['verifyPatch']
    >().returns.resolves.toEqualTypeOf<VerificationReportDto>();
  });

  it('should report what the new tests add and what they still miss', () => {
    expectTypeOf<
      VerificationReportDto['mutants']
    >().toEqualTypeOf<MutantCountsDto | null>();
    expectTypeOf<VerificationReportDto['survivingMutants']>().toEqualTypeOf<
      readonly SurvivingMutantDto[]
    >();
    expectTypeOf<
      VerificationReportDto['coverageAfter']
    >().toEqualTypeOf<TargetCoverageDto | null>();
  });

  it('should report its progress to one listener of the call', () => {
    expectTypeOf<MeasureBaselineRequest['onProgress']>().toEqualTypeOf<
      ProgressObserver<BaselineProgress> | undefined
    >();
    expectTypeOf<VerifyPatchRequest['onProgress']>().toEqualTypeOf<
      ProgressObserver<CheckProgress> | undefined
    >();
    expectTypeOf<CheckProgress['status']>().toEqualTypeOf<
      'running' | CheckStatus
    >();
  });
});
