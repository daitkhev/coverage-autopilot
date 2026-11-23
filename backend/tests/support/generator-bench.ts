import type {
  GenerationRequest,
  GenerationResult,
} from '#improvement/application/ports/test-generator.port';
import { ClaudeCodeGenerator } from '#improvement/infrastructure/generator/claude-code-generator.adapter';
import type { GeneratorSettings } from '#improvement/infrastructure/generator/generator-settings';
import type { SandboxCommandResult } from '#ports/sandbox.port';
import {
  type InMemoryArtifacts,
  inMemoryArtifacts,
} from '#tests/support/coverage-stand-ins';
import { FixedClock } from '#tests/support/fixed-clock';
import {
  generationRequest,
  GENERATOR_TEST_SETTINGS,
} from '#tests/support/generator-request';
import { TEST_NOW } from '#tests/support/generator-stream';
import {
  createProjectFolder,
  type ProjectFolder,
} from '#tests/support/project-folder';
import { RecordingSandbox } from '#tests/support/recording-sandbox';

/** The working copy a run starts with: one source and one test of it. */
const COPY: Readonly<Record<string, string>> = {
  'package.json': '{"name":"widgets"}',
  'src/price.ts': 'export const price = (n: number): number => n * 2;\n',
  'tests/old.test.ts': 'import "../src/price";\n',
};

/**
 * The adapter with a sandbox that starts nothing, a store in memory, a
 * clock that stands still and a working copy on disk. A test says what
 * the CLI prints and which files it writes.
 */
export interface GeneratorBench {
  readonly folder: ProjectFolder;
  readonly sandbox: RecordingSandbox;
  readonly artifacts: InMemoryArtifacts;
  /** The next run prints what `ended` holds and writes `files` first. */
  answer(
    ended: SandboxCommandResult,
    files?: Readonly<Record<string, string>>,
  ): void;
  generate(
    change?: Partial<GenerationRequest>,
    signal?: AbortSignal,
  ): Promise<GenerationResult>;
  /** What the store keeps of the last run. */
  savedOutput(): string;
}

export function generatorBench(
  settings: GeneratorSettings = GENERATOR_TEST_SETTINGS,
): GeneratorBench {
  const folder = createProjectFolder(COPY);
  const sandbox = new RecordingSandbox();
  const artifacts = inMemoryArtifacts();
  const generator = new ClaudeCodeGenerator(
    sandbox,
    artifacts,
    new FixedClock(TEST_NOW),
    settings,
  );
  return {
    folder,
    sandbox,
    artifacts,
    answer: (ended, files = {}) => {
      sandbox.answer(ended).onRun(() => {
        for (const [path, content] of Object.entries(files)) {
          folder.write(path, content);
        }
      });
    },
    generate: async (change = {}, signal = new AbortController().signal) =>
      generator.generate(generationRequest(folder.root, change), signal),
    savedOutput: () => artifacts.saved.at(-1)?.content ?? '',
  };
}
