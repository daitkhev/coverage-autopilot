import type { Provider } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { COVERAGE_PUBLIC_API } from '#coverage/application/contracts/coverage-public-api';
import { CLOCK } from '#kernel/time/clock';
import { ARTIFACT_STORE } from '#ports/artifact-store.port';
import { SANDBOX } from '#ports/sandbox.port';
import { REPOSITORIES_PUBLIC_API } from '#repositories/application/contracts/repositories-public-api';
import { inMemoryArtifacts } from '#tests/support/coverage-stand-ins';
import { FixedClock } from '#tests/support/fixed-clock';
import { MUTATION_TEST_SETTINGS } from '#tests/support/mutation-stand-ins';
import { RecordingSandbox } from '#tests/support/recording-sandbox';
import {
  measureRequestOf,
  NOW,
  policyWithout,
  verifyRequestOf,
} from '#tests/support/verification-requests';
import {
  type PatchingRepositories,
  patchingRepositories,
  type StandInCoverage,
  standInCoverage,
  VERIFICATION_TEST_SETTINGS,
} from '#tests/support/verification-stand-ins';
import {
  VERIFICATION_PUBLIC_API,
  type VerificationPublicApi,
} from '#verification/application/contracts/verification-public-api';
import { MUTATION_RUNNER } from '#verification/application/ports/mutation-runner.port';
import { TYPE_CHECKER } from '#verification/application/ports/type-checker.port';
import { VerificationApi } from '#verification/application/verification-api';
import { VERIFICATION_SETTINGS } from '#verification/application/verification-settings';
import { TscTypeChecker } from '#verification/infrastructure/compiler/tsc-type-checker.adapter';
import { InvalidVerificationSettingsError } from '#verification/infrastructure/errors/invalid-verification-settings.error';
import { MUTATION_SETTINGS } from '#verification/infrastructure/mutation/mutation-settings';
import { StrykerMutationRunner } from '#verification/infrastructure/mutation/stryker-mutation-runner.adapter';
import { VerificationModule } from '#verification/verification.module';

const NEVER = new AbortController().signal;

/** A patch that changes a file the commit has. */
const CHANGING_PATCH = [
  'diff --git a/src/used.ts b/src/used.ts',
  'index 3b18e51..9d1dcfd 100644',
  '--- a/src/used.ts',
  '+++ b/src/used.ts',
  '@@ -1 +1 @@',
  '-export const used = 1;',
  '+export const used = 2;',
  '',
].join('\n');

let coverage: StandInCoverage;
let repositories: PatchingRepositories;
let sandbox: RecordingSandbox;

/** What the service gives the module, with these settings of the tool. */
function services(mutation = MUTATION_TEST_SETTINGS): Provider[] {
  return [
    { provide: SANDBOX, useValue: sandbox },
    { provide: ARTIFACT_STORE, useValue: inMemoryArtifacts() },
    { provide: CLOCK, useValue: new FixedClock(NOW) },
    { provide: COVERAGE_PUBLIC_API, useValue: coverage },
    { provide: REPOSITORIES_PUBLIC_API, useValue: repositories },
    { provide: VERIFICATION_SETTINGS, useValue: VERIFICATION_TEST_SETTINGS },
    { provide: MUTATION_SETTINGS, useValue: mutation },
  ];
}

async function compile(providers = services()): Promise<TestingModule> {
  const module = await Test.createTestingModule({
    imports: [{ module: VerificationModule, providers }],
  }).compile();
  return module.init();
}

beforeEach(() => {
  coverage = standInCoverage();
  repositories = patchingRepositories();
  sandbox = new RecordingSandbox();
});

describe('VerificationModule', () => {
  it('should answer its contract with the adapters of the tools', async () => {
    const module = await compile();

    expect(module.get(VERIFICATION_PUBLIC_API)).toBeInstanceOf(VerificationApi);
    expect(module.get(TYPE_CHECKER)).toBeInstanceOf(TscTypeChecker);
    expect(module.get(MUTATION_RUNNER)).toBeInstanceOf(StrykerMutationRunner);
  });

  it('should reject a patch that changes a file, and start nothing for it', async () => {
    const module = await compile();
    const api = module.get<VerificationPublicApi>(VERIFICATION_PUBLIC_API);

    const report = await api.verifyPatch(
      verifyRequestOf({ patch: { text: CHANGING_PATCH, hash: 'patch-hash' } }),
      NEVER,
    );

    expect(report).toMatchObject({
      verdict: 'rejected',
      patchHash: 'patch-hash',
    });
    expect(report.reasons).toEqual([
      'The patch changes src/used.ts, a file the commit has.',
    ]);
    expect(repositories.created).toEqual([]);
    expect(sandbox.requests).toEqual([]);
  });

  it('should answer a project that cannot be measured with a value', async () => {
    coverage.preparation = {
      outcome: 'unsupported',
      reason: 'monorepo',
      detail: 'The repository holds more than one package.',
    };
    const module = await compile();
    const api = module.get<VerificationPublicApi>(VERIFICATION_PUBLIC_API);

    const result = await api.measureBaseline(
      measureRequestOf({ policy: policyWithout('mutation_gain') }),
      NEVER,
    );

    expect(result).toMatchObject({
      outcome: 'unsupported',
      reason: 'project_unsupported',
    });
    expect(repositories.disposed).toHaveLength(1);
  });

  it('should not start with settings that cannot work', async () => {
    const start = compile(
      services({
        ...MUTATION_TEST_SETTINGS,
        toolVersion: 'latest --registry=https://example.test',
        concurrency: 0,
        commandEnvironment: { TOKEN: 'a-secret-value' },
      }),
    );

    await expect(start).rejects.toThrow(
      new InvalidVerificationSettingsError(
        'The settings of the quality gate cannot work. ' +
          'mutation.toolVersion: invalid_format, mutation.concurrency: too_small.',
      ),
    );
  });
});
