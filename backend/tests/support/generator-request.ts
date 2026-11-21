import type { GenerationRequest } from '#improvement/application/ports/test-generator.port';
import { FilePath } from '#kernel/primitives/file-path';

/** The line of `src/price.ts` with a branch no test takes. */
const BRANCH_LINE = 12;

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
