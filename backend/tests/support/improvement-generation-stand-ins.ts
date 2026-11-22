import type {
  CoveragePublicApi,
  CoverageSnapshotDto,
  FileCoverageDto,
  FileCoverageRequest,
  SnapshotRequest,
} from '#coverage/application/contracts/coverage-public-api';
import type {
  GenerationRequest,
  GenerationResult,
  TestGenerator,
} from '#improvement/application/ports/test-generator.port';
import type { ExtractPatchResult } from '#repositories/application/contracts/repositories-public-api';
import { measuredPrice } from '#tests/support/improvement-generation-inputs';
import {
  patchDtoOf,
  resultOf,
} from '#tests/support/improvement-generation-results';
import {
  type StandInRepositories,
  standInRepositories,
} from '#tests/support/stand-in-repositories';
import { snapshotDto } from '#tests/support/verification-coverage';

export interface ScriptedGenerator extends TestGenerator {
  readonly requests: GenerationRequest[];
  /** What a call answers, or the fault it throws. */
  answer: GenerationResult | Error;
  /** Runs as a call starts, such as to look at the working copy. */
  onGenerate: () => void;
}

/**
 * A generator that writes a test unless a test says otherwise. It keeps
 * every request, and stops on the signal as the adapter does.
 */
export function scriptedGenerator(): ScriptedGenerator {
  const generator: ScriptedGenerator = {
    requests: [],
    answer: resultOf('generated'),
    onGenerate: () => undefined,
    generate: async (request, signal) => {
      generator.requests.push(request);
      generator.onGenerate();
      signal.throwIfAborted();
      const { answer } = generator;
      return answer instanceof Error
        ? Promise.reject(answer)
        : Promise.resolve(answer);
    },
  };
  return generator;
}

export interface GenerationCoverage extends CoveragePublicApi {
  /** The fresh snapshot, `null` once it is gone. */
  snapshot: CoverageSnapshotDto | null;
  /** The target as the snapshot measured it. */
  file: FileCoverageDto | null;
  readonly snapshotReads: SnapshotRequest[];
  readonly fileReads: FileCoverageRequest[];
}

async function refuse(): Promise<never> {
  return Promise.reject(new Error('Generation only reads a snapshot.'));
}

/** The coverage module as generation reads it: a Vitest snapshot. */
export function generationCoverage(): GenerationCoverage {
  const coverage: GenerationCoverage = {
    snapshot: snapshotDto(),
    file: measuredPrice(),
    snapshotReads: [],
    fileReads: [],
    getSnapshot: async (request) => {
      coverage.snapshotReads.push(request);
      return Promise.resolve(coverage.snapshot);
    },
    getFileCoverage: async (request) => {
      coverage.fileReads.push(request);
      return Promise.resolve(coverage.file);
    },
    captureSnapshot: refuse,
    prepareProject: refuse,
    runTests: refuse,
    listSnapshotFiles: refuse,
  };
  return coverage;
}

export interface GenerationRepositories extends StandInRepositories {
  /**
   * What a copy holds after the call, or the fault taking a patch from it
   * throws: a new test unless a test says.
   */
  extraction: ExtractPatchResult | Error;
  /** The copies a patch was taken from. */
  readonly extracted: string[];
}

/** The stand-in repositories, with a git that takes a patch from a copy. */
export function generationRepositories(): GenerationRepositories {
  const repositories: GenerationRepositories = {
    ...standInRepositories(),
    extraction: { outcome: 'extracted', patch: patchDtoOf() },
    extracted: [],
    extractPatch: async ({ workingCopyId }) => {
      repositories.extracted.push(workingCopyId);
      const { extraction } = repositories;
      return extraction instanceof Error
        ? Promise.reject(extraction)
        : Promise.resolve(extraction);
    },
  };
  return repositories;
}
