import type { GenerationRequest } from '#improvement/application/ports/test-generator.port';
import type { ReadyGeneratorSettings } from '#improvement/infrastructure/generator/generator-settings';
import { FilePath } from '#kernel/primitives/file-path';
import { ALLOWED_TOOLS } from '#tests/support/generator-stream';

/** The line of `src/price.ts` with a branch no test takes. */
const BRANCH_LINE = 12;

/** The value of the credential in a test. No real service knows it. */
export const CREDENTIAL_VALUE = 'not-a-real-credential-4711';

/** The settings of the generator in a test: a subscription login. */
export const GENERATOR_TEST_SETTINGS: ReadyGeneratorSettings = {
  command: ['claude'],
  allowedTools: ALLOWED_TOOLS,
  credential: {
    variable: 'CLAUDE_CODE_OAUTH_TOKEN',
    value: CREDENTIAL_VALUE,
  },
  environment: { PATH: '/usr/local/bin:/usr/bin:/bin' },
  scan: { maxFiles: 50, maxFileBytes: 65_536 },
};

/** The first attempt at `src/price.ts`, in the working copy at `root`. */
export function generationRequest(
  root: string,
  change: Partial<GenerationRequest> = {},
): GenerationRequest {
  return {
    workingCopyPath: root,
    owner: 'improvement:imp-1:attempt:1',
    target: {
      file: FilePath.create('src/price.ts'),
      uncoveredLines: [
        { start: 3, end: 5 },
        { start: 9, end: 9 },
      ],
      openBranchLines: [BRANCH_LINE],
      uncoveredFunctions: [{ name: 'discount', line: 3 }],
      undetectedMutants: [
        { line: 42, mutator: 'EqualityOperator', replacement: '>=' },
      ],
    },
    testFileSuffixes: ['.test.ts', '.test.tsx'],
    testRunner: 'vitest',
    feedback: null,
    generator: {
      cli: 'claude_code',
      model: 'claude-test-model',
      promptVersion: '1',
    },
    limits: { maxTurns: 12, maxCostUsd: null, timeoutMs: 600_000 },
    ...change,
  };
}
